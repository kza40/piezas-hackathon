import type { ForecastHour, WeatherForecast, WeatherHour, WeekClimate } from '../domain/types';

export type { ForecastHour, WeatherForecast, WeatherHour, WeekClimate };

const HOUR = 60 * 60 * 1000;
const MS_48H = 48 * HOUR;
export const OUTLOOK_DAYS = 5;
export const RECENT_DAYS = 14; // matches the 14 days of sensor history we keep

export function summarizeForecast(hours: ForecastHour[], now: Date): WeatherForecast {
  const start = now.getTime();
  const end = start + MS_48H;
  const window = hours.filter((h) => {
    const t = Date.parse(h.time);
    return t >= start && t <= end;
  });
  const use = window.length > 0 ? window : hours.slice(0, 48);
  const rainNext48hMm = use.reduce((s, h) => s + h.rainMm, 0);
  const overnightLowC = use.length === 0 ? 0 : Math.min(...use.map((h) => h.tempC));
  const outlook = hours.filter((h) => {
    const t = Date.parse(h.time);
    return t >= start && t < start + OUTLOOK_DAYS * 24 * HOUR;
  });
  return { hours: use, rainNext48hMm, overnightLowC, outlook };
}

export interface WeatherProvider {
  getForecast(lat: number, lon: number, now?: Date): Promise<WeatherForecast>;
  /** The last 14 days of hourly rain and ET0, oldest first, up to `now`. */
  getRecent(lat: number, lon: number, now?: Date): Promise<WeatherHour[]>;
  getHistory(lat: number, lon: number): Promise<WeekClimate[]>;
}
