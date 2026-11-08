import { readFileSync } from 'node:fs';
import type { ForecastHour, WeekClimate } from '../domain/types';
import { summarizeForecast, type WeatherProvider } from './types';

function loadForecastFile(path: string): ForecastHour[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  const rows = Array.isArray(raw) ? raw : (raw as { hours: unknown[] }).hours;
  return (rows as { time: string; temp_c: number; rain_mm: number }[]).map((r) => ({
    time: r.time,
    tempC: r.temp_c,
    rainMm: r.rain_mm,
  }));
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

export function createStubWeather(opts: { forecastPath: string; historyPath: string }): WeatherProvider {
  return {
    async getForecast(_lat, _lon, now = new Date()) {
      return summarizeForecast(loadForecastFile(opts.forecastPath), now);
    },
    async getHistory() {
      return loadHistoryFile(opts.historyPath);
    },
  };
}