// Shared shapes for the field models. Everything in lib/ml is pure: no Piezas calls, no clock reads
// (callers pass `now`), so every result is repeatable and unit-tested.
import type { ForecastHour, WeatherHour } from '../domain/types';

export type { ForecastHour, WeatherHour };

export const HOUR = 3_600_000;

/** One hourly soil-moisture reading, %. Series are oldest first. */
export interface Point {
  time: string;
  value: number;
}

export interface SensorSeries {
  sensorId: string;
  sensorName: string;
  points: Point[];
}

export type EventLabel = 'irrigation' | 'rain' | 'none';

export const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** "Nov 3" in UTC, for the plain-words basis shown to the farmer. */
export const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
