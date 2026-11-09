// Each demo scenario, run through the real field models and advice rules, shows the situation it promises.
// Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyScenario, DEMO_SCENARIOS, type DemoScenario } from './demo';
import { simulateSpots } from './simulate';
import { sensorHealth } from '../ml/health';
import { detectWettingEvents, lastWatered } from '../ml/events';
import { estimateFieldCapacity } from '../ml/capacity';
import { suggestTrigger } from '../ml/trigger';
import { fitDrying, waterBy } from '../ml/drydown';
import { wateringAdvice } from '../domain/watering';
import { soilWarning } from '../domain/soil';
import type { CropAdviceProfile, ForecastHour, WeatherForecast } from '../domain/types';

const HOUR = 3_600_000;
const LON = -122.3; // Fraser Valley
const NOW = new Date('2026-11-12T19:20:00Z'); // 11:20 am farm time
const crop = (name: string, phMin: number, phMax: number): CropAdviceProfile => ({ name, moistureMin: null, moistureMax: null, phMin, phMax, ecMax: null, frostRiskC: null });
const CROPS = { blueberry: crop('Blueberries', 4.5, 5.2), alfalfa: crop('Alfalfa', 6.5, 7.5), wheat: crop('Wheat', 5.8, 6.5), barley: crop('Barley', 5.8, 6.5), canola: crop('Canola', NaN, NaN) };

const start = Math.floor(NOW.getTime() / HOUR) * HOUR;
const dryOutlook: ForecastHour[] = Array.from({ length: 120 }, (_, i) => ({ time: new Date(start + (i + 1) * HOUR).toISOString(), tempC: 8, rainMm: 0, et0Mm: 0.04 }));
const forecast: WeatherForecast = { hours: dryOutlook.slice(0, 48), rainNext48hMm: 0, overnightLowC: 4, outlook: dryOutlook };
const recent = Array.from({ length: 14 * 24 }, (_, i) => ({ time: new Date(start - (14 * 24 - 1 - i) * HOUR).toISOString(), rainMm: i === 200 ? 9 : 0, et0Mm: 0.04 }));

function run(scenario: DemoScenario, cropKey: keyof typeof CROPS, opts: { irrigated: boolean; trigger: number | null; soil?: string; probes?: number }) {
  const c = CROPS[cropKey];
  const ids = Array.from({ length: opts.probes ?? 2 }, (_, i) => `${scenario}-probe-${i}`);
  const base = simulateSpots(ids, c, LON, NOW, 14, { rain: recent, irrigated: false });
  const rain = new Map(recent.map((w) => [Date.parse(w.time), w.rainMm]));
  const spots = applyScenario(scenario, base, LON, rain);
  const series = spots.map((rs, i) => ({ sensorId: ids[i], sensorName: `Probe ${i + 1}`, points: rs.filter((r) => r.type === 'soil_moisture').map((r) => ({ time: r.time, value: r.value })) }));
  const health = sensorHealth(series, recent, NOW);
  const faulty = new Set(health.filter((h) => h.status === 'faulty').map((h) => h.sensorId));
  const trusted = series.filter((s) => !faulty.has(s.sensorId));
  const events = detectWettingEvents(trusted, recent, {});
  const { capacity } = estimateFieldCapacity(trusted, events);
  const { suggestion } = suggestTrigger(capacity, opts.soil ?? '', cropKey);
  const samples = trusted.map((s) => ({ sensorId: s.sensorId, sensorName: s.sensorName, value: s.points.at(-1)!.value, time: s.points.at(-1)!.time }));
  const watering = wateringAdvice(c, samples, forecast, NOW, { irrigated: opts.irrigated, trigger: opts.trigger, faultySensors: faulty.size });
  const driest = trusted.find((s) => s.sensorId === watering.driestSensorId);
  const when = opts.trigger != null && driest && watering.driestValue != null ? waterBy(watering.driestValue, opts.trigger, fitDrying(driest.points, recent, events), dryOutlook) : null;
  const ph = spots[0].filter((r) => r.type === 'soil_ph').at(-1)?.value ?? null;
  return { watering, health, events, suggestion, when, soil: soilWarning(c, { ph, ec: null }), lastWatered: lastWatered(events) };
}

test('every scenario is described', () => {
  assert.deepEqual(Object.keys(DEMO_SCENARIOS).sort(), ['low_ph', 'offline', 'setup', 'steady', 'stuck_sensor', 'wait_window', 'water_today']);
});

test('water_today: below the saved trigger with a dry forecast gives Water today, last watered 5 days ago', () => {
  const r = run('water_today', 'blueberry', { irrigated: true, trigger: 28, soil: 'Sandy loam' });
  assert.equal(r.watering.status, 'water_today', r.watering.reason);
  assert.equal(r.when?.kind, 'now');
  assert.equal(r.events.length, 2);
  assert.ok(r.events.every((e) => e.label === 'irrigation'));
  assert.ok(Math.abs(NOW.getTime() - Date.parse(r.lastWatered!) - (5 * 24 + 5) * HOUR) < 3 * HOUR, r.lastWatered!);
  assert.equal(r.soil, null);
});

test('wait_window: above the trigger gives Wait and a water-by window in the next days', () => {
  const r = run('wait_window', 'alfalfa', { irrigated: true, trigger: 27, soil: 'Sandy loam' });
  assert.equal(r.watering.status, 'wait', r.watering.reason);
  assert.equal(r.when?.kind, 'window', JSON.stringify(r.when));
  assert.ok(r.health.every((h) => h.status === 'ok'));
});

test('stuck_sensor: the stuck probe is faulty and left out; the healthy ones give Wait', () => {
  const r = run('stuck_sensor', 'blueberry', { irrigated: true, trigger: 27, soil: 'Sandy loam', probes: 3 });
  const stuck = r.health.find((h) => h.sensorName === 'Probe 3')!;
  assert.equal(stuck.status, 'faulty');
  assert.match(stuck.reason!, /exactly 12%/);
  assert.equal(r.watering.status, 'wait', r.watering.reason);
  assert.notEqual(r.watering.driestSensorName, 'Probe 3');
});

test('setup: irrigated without a trigger is Not configured, with a suggested trigger from the last soaking', () => {
  const r = run('setup', 'alfalfa', { irrigated: true, trigger: null, soil: 'Sandy loam' });
  assert.equal(r.watering.status, 'not_configured');
  assert.ok(r.suggestion, 'a suggestion');
  assert.ok(r.suggestion!.value >= 20 && r.suggestion!.value <= 28, String(r.suggestion!.value));
});

test('steady: a rain-fed field is fine and its rise during rain is labelled rain', () => {
  const r = run('steady', 'wheat', { irrigated: false, trigger: null });
  assert.equal(r.watering.status, 'rain_fed');
  assert.ok(r.events.some((e) => e.label === 'rain'), JSON.stringify(r.events.map((e) => [e.start, e.label, e.rainMm])));
  assert.equal(r.lastWatered, null);
  assert.equal(r.soil, null);
});

test('low_ph: soil pH below the crop range gives a soil warning', () => {
  const r = run('low_ph', 'barley', { irrigated: false, trigger: null });
  assert.equal(r.watering.status, 'rain_fed');
  assert.match(r.soil ?? '', /pH is 5\.\d+, too low for Barley/);
});

test('offline: no reading in the last 10 hours gives No recent reading', () => {
  const r = run('offline', 'canola', { irrigated: false, trigger: null });
  assert.equal(r.watering.status, 'no_recent_reading');
});

test('regenerating later the same day keeps the same waterings', () => {
  const ids = ['a', 'b'];
  const at = (d: Date) => applyScenario('water_today', simulateSpots(ids, CROPS.blueberry, LON, d, 14, { irrigated: false }), LON);
  const events = (d: Date) =>
    detectWettingEvents(
      at(d).map((rs, i) => ({ sensorId: ids[i], sensorName: ids[i], points: rs.filter((r) => r.type === 'soil_moisture') })),
      [],
      {},
    ).map((e) => e.start);
  assert.deepEqual(events(NOW), events(new Date(NOW.getTime() + 5 * HOUR)));
});
