// Scripted weather for a demo farm (farm.demoWeather, set by scripts/seed-demo.ts): a dry spell ahead and one
// soaking rain about 3½ days ago, so the demo shows every watering situation whatever the real sky is doing.
// Built in code (not data files) so it works wherever the app runs. The page says this farm's weather is simulated.
import type { ForecastHour, WeatherHour } from '../domain/types';
import { OUTLOOK_DAYS, RECENT_DAYS, summarizeForecast, type WeatherProvider } from './types';

const HOUR = 3_600_000;
const RAIN_HOURS_AGO = [84, 83, 82, 81, 80, 79]; // 2 mm an hour: 12 mm in all
const localHour = (t: number, lon: number) => (new Date(t).getUTCHours() + lon / 15 + 24) % 24;
const et0At = (t: number, lon: number) => Math.max(0, Math.sin(((localHour(t, lon) - 6) / 12) * Math.PI)) * 0.12; // daytime only, ~1.5 mm a day

export function createDemoWeather(live: WeatherProvider): WeatherProvider {
  return {
    async getForecast(_lat, lon, now = new Date()) {
      const start = Math.floor(now.getTime() / HOUR) * HOUR;
      const hours: ForecastHour[] = Array.from({ length: OUTLOOK_DAYS * 24 }, (_, i) => {
        const t = start + i * HOUR;
        return {
          time: new Date(t).toISOString(),
          tempC: Math.round((14 + 6 * Math.sin(((localHour(t, lon) - 9) / 24) * 2 * Math.PI)) * 10) / 10, // warmest ~3 pm
          rainMm: 0,
          et0Mm: et0At(t, lon),
        };
      });
      return summarizeForecast(hours, now);
    },
    async getRecent(_lat, lon, now = new Date()) {
      const end = Math.floor(now.getTime() / HOUR) * HOUR;
      return Array.from({ length: RECENT_DAYS * 24 }, (_, i): WeatherHour => {
        const ago = RECENT_DAYS * 24 - 1 - i;
        const t = end - ago * HOUR;
        return { time: new Date(t).toISOString(), rainMm: RAIN_HOURS_AGO.includes(ago) ? 2 : 0, et0Mm: et0At(t, lon) };
      });
    },
    // Planting weeks use typical past weather, which is not part of the demo story: the farm's real climate.
    getHistory: (lat, lon) => live.getHistory(lat, lon),
  };
}
