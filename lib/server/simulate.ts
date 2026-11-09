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

// `days` of hourly readings ending at the last full hour before `end`. `longitude` sets local time (15 degrees per hour).
// `rain` is the farm's hourly rain record over the same days (none means a dry spell).
export function simulateSensor(seed: string, crop: SimCrop, longitude: number, end: Date, days = 14, rain: WeatherHour[] = []): Reading[] {
  const rnd = random(seed);
  const noise = (size: number) => (rnd() - 0.5) * 2 * size;
  const mMin = crop.moistureMin ?? 30;
  const mMax = crop.moistureMax ?? 45;
  const phMid = ((crop.phMin ?? 6) + (crop.phMax ?? 7)) / 2;
  const ecMax = crop.ecMax ?? 2;

  const last = Math.floor(end.getTime() / HOUR) * HOUR;
  const hours = days * 24;
  let dayMean = 10 + noise(3); // this sensor's weather starts a little different from its neighbours
  let soilT = dayMean;
  // Each spot has its own usual wetness: some sit below the crop's range (a dry field to water), most inside it.
  // It holds up to its field capacity (target + 6); water above that drains away within hours.
  const target = mMin + (rnd() - 0.45) * (mMax - mMin);
  const capacity = target + 6;
  let moisture = target + noise(3);
  let excess = 0;
  const rainAt = new Map(rain.map((w) => [Math.floor(Date.parse(w.time) / HOUR), w.rainMm]));
  let ph = phMid + noise(0.2);
  let ec = ecMax * (0.45 + rnd() * 0.2);
  const out: Reading[] = [];

  for (let i = hours - 1; i >= 0; i--) {
    const at = new Date(last - i * HOUR);
    const localHour = (at.getUTCHours() + longitude / 15 + 24) % 24;
    if (localHour < 1) dayMean += noise(1.5); // the weather changes a little each day
    const airT = dayMean + 7 * Math.sin(((localHour - 9) / 24) * 2 * Math.PI) + noise(0.4); // warmest ~3 pm
    const humidity = clamp(72 - 2.5 * (airT - dayMean) + noise(3), 25, 100);
    soilT += (airT - soilT) * 0.08; // follows the air, smoother and later

    // Wetting: recorded rain (about a point per mm), or the farmer irrigating at 6 am once the spot is dry.
    let water = (rainAt.get(Math.floor(at.getTime() / HOUR)) ?? 0) * 1;
    if (Math.floor(localHour) === 6 && moisture < target - 4) water += 8 + rnd() * 4;
    if (water > 0) {
      const room = Math.max(0, capacity - moisture);
      moisture += Math.min(water, room);
      excess += water - Math.min(water, room);
    }
    excess *= 0.75; // drains away within hours
    moisture -= 0.02 + Math.max(0, airT) * 0.004; // dries faster when warm
    moisture = clamp(moisture, Math.max(5, mMin - 12), mMax + 8);
    ph = clamp(ph + noise(0.002), phMid - 1, phMid + 1); // at most ~0.05 a day
    ec = clamp(ec + noise(0.004) + (rnd() < 1 / 200 ? ecMax * 0.3 : 0) - (ec - ecMax * 0.5) * 0.01, 0.05, ecMax * 1.5);

    const time = at.toISOString();
    out.push(
      { type: 'soil_moisture', value: round(moisture + excess + noise(0.3), 1), time },
      { type: 'soil_temperature', value: round(soilT + noise(0.1), 1), time },
      { type: 'soil_ec', value: round(ec, 2), time },
      { type: 'soil_ph', value: round(ph, 2), time },
      { type: 'air_temperature', value: round(airT, 1), time },
      { type: 'air_humidity', value: round(humidity, 0), time },
    );
  }
  return out;
}
