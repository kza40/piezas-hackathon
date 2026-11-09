// The weather stub and forecast summary: no network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createStubWeather } from './stub';
import { summarizeForecast } from './types';

const dir = join(process.cwd(), 'data', 'weather');
const stub = (forecast: string, recent = 'recent.json') =>
  createStubWeather({ forecastPath: join(dir, forecast), historyPath: join(dir, 'history.json'), recentPath: join(dir, recent) });
const now = new Date('2026-11-20T15:40:00Z'); // any date: the stub follows now

test('the stub forecast starts at the current hour, carries ET0, and gives a 5-day outlook', async () => {
  const f = await stub('rain-forecast.json').getForecast(0, 0, now);
  assert.equal(f.hours[0].time, '2026-11-20T16:00:00.000Z', 'the first whole hour from now');
  assert.ok(f.rainNext48hMm >= 5, 'the rain file is still rainy');
  assert.ok(f.hours.every((h) => h.et0Mm >= 0));
  assert.ok(f.outlook.length > 0 && f.outlook.length <= 5 * 24);
});

test('recent weather is 14 days of hours ending now, with the rains placed relative to now', async () => {
  const r = await stub('mild-forecast.json').getRecent(0, 0, now);
  assert.equal(r.length, 14 * 24);
  assert.equal(r.at(-1)?.time, '2026-11-20T15:00:00.000Z');
  const rainy = r.filter((h) => h.rainMm > 0);
  assert.equal(rainy.reduce((s, h) => s + h.rainMm, 0), 21, '12 mm and 9 mm');
  assert.equal(r[r.length - 1 - 82].rainMm, 3, '3 mm 82 hours ago');
  assert.ok(Math.abs(r.slice(-24).reduce((s, h) => s + h.et0Mm, 0) - 1.2) < 1e-9, 'ET0 1.2 mm a day');
});

test('no recent file means 14 dry days', async () => {
  const r = await stub('mild-forecast.json', 'missing.json').getRecent(0, 0, now);
  assert.equal(r.length, 14 * 24);
  assert.ok(r.every((h) => h.rainMm === 0));
});

test('the 48-hour fallback never uses past hours', () => {
  const h = (hoursFromNow: number, rainMm: number) => ({ time: new Date(now.getTime() + hoursFromNow * 3_600_000).toISOString(), rainMm, et0Mm: 0, tempC: 5 });
  // Odd timestamps: nothing inside the window itself, a wet past and a dry far future.
  const f = summarizeForecast([h(-200, 30), h(-100, 30), h(60, 0), h(61, 0)], now);
  assert.equal(f.rainNext48hMm, 0);
  assert.equal(f.hours.length, 2);
});
