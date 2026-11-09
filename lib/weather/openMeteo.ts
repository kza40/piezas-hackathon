import type { ForecastHour } from '../domain/types';
import { OUTLOOK_DAYS, RECENT_DAYS, summarizeForecast, type WeatherProvider } from './types';

// One Open-Meteo call gives the last 14 days and the next 5 (rain, temperature, FAO-56 ET0).
// Advice runs on every page view and every soil-moisture ingest, so each location is fetched
// at most every 30 minutes. In memory: losing it on a restart only costs one more call.
const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; hours: Promise<ForecastHour[]> }>();

async function fetchHours(lat: number, lon: number): Promise<ForecastHour[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation,et0_fao_evapotranspiration` +
    `&past_days=${RECENT_DAYS}&forecast_days=${OUTLOOK_DAYS}&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo forecast failed (${res.status}).`);
  const data = (await res.json()) as {
    hourly: { time: string[]; temperature_2m: number[]; precipitation: (number | null)[]; et0_fao_evapotranspiration: (number | null)[] };
  };
  return data.hourly.time.map((t, i) => ({
    time: new Date(t.endsWith('Z') ? t : `${t}Z`).toISOString(),
    tempC: data.hourly.temperature_2m[i],
    rainMm: data.hourly.precipitation[i] ?? 0,
    et0Mm: data.hourly.et0_fao_evapotranspiration[i] ?? 0,
  }));
}

function hoursFor(lat: number, lon: number): Promise<ForecastHour[]> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`; // about 1 km: same weather
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.hours;
  const hours = fetchHours(lat, lon);
  cache.set(key, { at: Date.now(), hours });
  hours.catch(() => cache.delete(key)); // never keep a failure
  return hours;
}

export function createOpenMeteoWeather(): WeatherProvider {
  return {
    async getForecast(lat, lon, now = new Date()) {
      return summarizeForecast(await hoursFor(lat, lon), now);
    },
    async getRecent(lat, lon, now = new Date()) {
      const from = now.getTime() - RECENT_DAYS * 24 * 3_600_000;
      return (await hoursFor(lat, lon))
        .filter((h) => {
          const t = Date.parse(h.time);
          return t >= from && t <= now.getTime();
        })
        .map(({ time, rainMm, et0Mm }) => ({ time, rainMm, et0Mm }));
    },
    async getHistory() {
      throw new Error('Set WEATHER_STUB_DIR with history.json for planting advice.');
    },
  };
}
