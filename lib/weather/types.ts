import type { ForecastHour, WeatherForecast, WeekClimate } from '../domain/types';

export type { ForecastHour, WeatherForecast, WeekClimate };

const MS_48H = 48 * 60 * 60 * 1000;

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
  return { hours: use, rainNext48hMm, overnightLowC };
}

export interface WeatherProvider {
  getForecast(lat: number, lon: number, now?: Date): Promise<WeatherForecast>;
  getHistory(lat: number, lon: number): Promise<WeekClimate[]>;
}