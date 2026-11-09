import { join } from 'node:path';
import { createOpenMeteoWeather } from './openMeteo';
import { createStubWeather } from './stub';
import { createDemoWeather } from './demo';
import type { WeatherProvider } from './types';

/** The weather for a farm: scripted for a demo farm (lib/weather/demo.ts), otherwise the stub in tests or Open-Meteo. */
export function getWeather(farm?: { demoWeather?: boolean }): WeatherProvider {
  if (farm?.demoWeather) return createDemoWeather(liveWeather());
  return liveWeather();
}

function liveWeather(): WeatherProvider {
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