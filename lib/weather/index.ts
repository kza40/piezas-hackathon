import { join } from 'node:path';
import { createOpenMeteoWeather } from './openMeteo';
import { createStubWeather } from './stub';
import type { WeatherProvider } from './types';

export function getWeather(): WeatherProvider {
  const dir = process.env.WEATHER_STUB_DIR;
  if (dir) {
    return createStubWeather({
      forecastPath: join(dir, process.env.WEATHER_STUB_FORECAST ?? 'mild-forecast.json'),
      historyPath: join(dir, process.env.WEATHER_STUB_HISTORY ?? 'history.json'),
      recentPath: join(dir, process.env.WEATHER_STUB_RECENT ?? 'recent.json'),
    });
  }
  return createOpenMeteoWeather();
}