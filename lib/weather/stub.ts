import { existsSync, readFileSync } from 'node:fs';
import type { ForecastHour, WeatherHour, WeekClimate } from '../domain/types';
import { RECENT_DAYS, summarizeForecast, type WeatherProvider } from './types';

const HOUR = 3_600_000;
const hourOf = (d: Date) => Math.floor(d.getTime() / HOUR) * HOUR;

// Stub files without ET0 get a rough one from temperature (about 1 mm a day at 10 °C). Tests only.
const roughEt0 = (tempC: number) => Math.max(0, tempC) * 0.004;

// The forecast file's hours are moved to start at the current hour, so a fixed file works on any date.
function loadForecastFile(path: string, now: Date): ForecastHour[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  const rows = (Array.isArray(raw) ? raw : (raw as { hours: unknown[] }).hours) as { temp_c: number; rain_mm: number; et0_mm?: number }[];
  const start = hourOf(now);
  return rows.map((r, i) => ({
    time: new Date(start + i * HOUR).toISOString(),
    tempC: r.temp_c,
    rainMm: r.rain_mm,
    et0Mm: r.et0_mm ?? roughEt0(r.temp_c),
  }));
}

// Recent weather file: { "et0_mm_per_day": 1.2, "rain": [{ "hours_ago": 80, "mm": 2 }, ...] }.
// Times are relative to now so the stub lines up with simulated readings ending now.
// No file means 14 dry days.
function loadRecentFile(path: string, now: Date): WeatherHour[] {
  const f = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf-8')) as { et0_mm_per_day?: number; rain?: { hours_ago: number; mm: number }[] })
    : {};
  const et0 = (f.et0_mm_per_day ?? 1) / 24;
  const rain = new Map((f.rain ?? []).map((r) => [r.hours_ago, r.mm]));
  const end = hourOf(now);
  const out: WeatherHour[] = [];
  for (let ago = RECENT_DAYS * 24 - 1; ago >= 0; ago--) {
    out.push({ time: new Date(end - ago * HOUR).toISOString(), rainMm: rain.get(ago) ?? 0, et0Mm: et0 });
  }
  return out;
}

function loadHistoryFile(path: string): WeekClimate[] {
  const rows = JSON.parse(readFileSync(path, 'utf-8')) as {
    week: number;
    avg_temp_c: number;
    avg_low_c: number;
    frost_chance_pct: number;
    avg_rain_mm: number;
  }[];
  return rows.map((r) => ({
    week: r.week,
    avgTempC: r.avg_temp_c,
    avgLowC: r.avg_low_c,
    frostChancePct: r.frost_chance_pct,
    avgRainMm: r.avg_rain_mm,
  }));
}

export function createStubWeather(opts: { forecastPath: string; historyPath: string; recentPath: string }): WeatherProvider {
  return {
    async getForecast(_lat, _lon, now = new Date()) {
      return summarizeForecast(loadForecastFile(opts.forecastPath, now), now);
    },
    async getRecent(_lat, _lon, now = new Date()) {
      return loadRecentFile(opts.recentPath, now);
    },
    async getHistory() {
      return loadHistoryFile(opts.historyPath);
    },
  };
}
