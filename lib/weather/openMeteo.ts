import { summarizeForecast, type WeatherProvider } from './types';
export function createOpenMeteoWeather(): WeatherProvider {
  return {
    async getForecast(lat, lon, now = new Date()) {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,precipitation&forecast_days=3&timezone=UTC`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo forecast failed (${res.status}).`);
      const data = (await res.json()) as {
        hourly: { time: string[]; temperature_2m: number[]; precipitation: number[] };
      };
      const fixed = data.hourly.time.map((t, i) => ({
        time: t.endsWith('Z') ? t : `${t}Z`,
        tempC: data.hourly.temperature_2m[i],
        rainMm: data.hourly.precipitation[i] ?? 0,
      }));
      return summarizeForecast(fixed, now);
    },
    async getHistory() {
      throw new Error('Set WEATHER_STUB_DIR with history.json for planting advice.');
    },
  };
}
