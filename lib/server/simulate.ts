// Realistic hourly readings of all six types for one sensor (SPEC R-006), in exactly the shape a device sends.
// Pure and deterministic: the same seed and end time always give the same readings, so tests and demos repeat.
// Patterns follow docs/synthetic-data.md: daily air temperature cycle, humidity highest when coldest, soil
// temperature smoother and delayed, slow pH and EC. Soil moisture follows the farm's recorded rain and a
// farmer who irrigates at 6 am when a spot gets dry, then drains to field capacity and dries with the warmth,
// so the field models (lib/ml) see realistic rain and irrigation events.
import type { Reading } from './readings';
import type { WeatherHour } from '../domain/types';

export interface SimCrop {
  moistureMin: number | null;
  moistureMax: number | null;
  phMin: number | null;
  phMax: number | null;
  ecMax: number | null;
}

const HOUR = 3_600_000;

// Small, fast seeded random numbers (mulberry32) from a string seed.
function random(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface SimOptions {
  rain?: WeatherHour[]; // the farm's hourly rain record over the same days (none means a dry spell)
  irrigated?: boolean; // whether the farmer waters this field (R-021); default true
}

// `days` of hourly readings for one spot, ending at the last full hour before `end`.
export function simulateSensor(seed: string, crop: SimCrop, longitude: number, end: Date, days = 14, opts: SimOptions = {}): Reading[] {
  return simulateSpots([seed], crop, longitude, end, days, opts)[0];
}

// One field's spots (one per sensor, each seeded by its id) together, because the farmer waters the whole
// field at once: at 6 am local, once any spot has dried below its usual level. `longitude` sets local time.
export function simulateSpots(seeds: string[], crop: SimCrop, longitude: number, end: Date, days = 14, opts: SimOptions = {}): Reading[][] {
  const { rain = [], irrigated = true } = opts;
  const mMin = crop.moistureMin ?? 30;
  const mMax = crop.moistureMax ?? 45;
  const phMid = ((crop.phMin ?? 6) + (crop.phMax ?? 7)) / 2;
  const ecMax = crop.ecMax ?? 2;
  const last = Math.floor(end.getTime() / HOUR) * HOUR;
  const hours = days * 24;
  const rainAt = new Map(rain.map((w) => [Math.floor(Date.parse(w.time) / HOUR), w.rainMm]));

  const spots = seeds.map((seed) => {
    const rnd = random(seed);
    const noise = (size: number) => (rnd() - 0.5) * 2 * size;
    const dayMean = 10 + noise(3); // this sensor's weather starts a little different from its neighbours
    // Each spot has its own usual wetness: some sit below the crop's range (a dry field to water), most inside it.
    // It holds up to its field capacity (target + 6); water above that drains away within hours.
    const target = mMin + (rnd() - 0.45) * (mMax - mMin);
    return {
      rnd,
      noise,
      dayMean,
      soilT: dayMean,
      airT: 0,
      humidity: 0,
      target,
      capacity: target + 6,
      moisture: target + noise(3),
      excess: 0,
      ph: phMid + noise(0.2),
      ec: ecMax * (0.45 + rnd() * 0.2),
      out: [] as Reading[],
    };
  });

  for (let i = hours - 1; i >= 0; i--) {
    const at = new Date(last - i * HOUR);
    const time = at.toISOString();
    const localHour = (at.getUTCHours() + longitude / 15 + 24) % 24;
    for (const p of spots) {
      if (localHour < 1) p.dayMean += p.noise(1.5); // the weather changes a little each day
      p.airT = p.dayMean + 7 * Math.sin(((localHour - 9) / 24) * 2 * Math.PI) + p.noise(0.4); // warmest ~3 pm
      p.humidity = clamp(72 - 2.5 * (p.airT - p.dayMean) + p.noise(3), 25, 100);
      p.soilT += (p.airT - p.soilT) * 0.08; // follows the air, smoother and later
    }
    const irrigate = irrigated && Math.floor(localHour) === 6 && spots.some((p) => p.moisture < p.target - 4);
    const rainMm = rainAt.get(Math.floor(at.getTime() / HOUR)) ?? 0;
    for (const p of spots) {
      // Wetting: recorded rain (about a point per mm), or the farmer's watering.
      const water = rainMm + (irrigate ? 8 + p.rnd() * 4 : 0);
      if (water > 0) {
        const room = Math.max(0, p.capacity - p.moisture);
        p.moisture += Math.min(water, room);
        p.excess += water - Math.min(water, room);
      }
      p.excess *= 0.75; // drains away within hours
      p.moisture -= 0.02 + Math.max(0, p.airT) * 0.004; // dries faster when warm
      p.moisture = clamp(p.moisture, Math.max(5, mMin - 12), mMax + 8);
      p.ph = clamp(p.ph + p.noise(0.002), phMid - 1, phMid + 1); // at most ~0.05 a day
      p.ec = clamp(p.ec + p.noise(0.004) + (p.rnd() < 1 / 200 ? ecMax * 0.3 : 0) - (p.ec - ecMax * 0.5) * 0.01, 0.05, ecMax * 1.5);
      p.out.push(
        { type: 'soil_moisture', value: round(p.moisture + p.excess + p.noise(0.3), 1), time },
        { type: 'soil_temperature', value: round(p.soilT + p.noise(0.1), 1), time },
        { type: 'soil_ec', value: round(p.ec, 2), time },
        { type: 'soil_ph', value: round(p.ph, 2), time },
        { type: 'air_temperature', value: round(p.airT, 1), time },
        { type: 'air_humidity', value: round(p.humidity, 0), time },
      );
    }
  }
  return spots.map((p) => p.out);
}
