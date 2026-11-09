// The field models on hand-built series whose right answers are known. No network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textureOf } from './agronomy';
import { estimateFieldCapacity } from './capacity';
import { fitDrying, waterBy } from './drydown';
import { detectWettingEvents, lastWatered } from './events';
import { sensorHealth } from './health';
import { suggestTrigger } from './trigger';
import { HOUR, type ForecastHour, type Point, type SensorSeries, type WeatherHour } from './types';

const now = new Date('2026-11-20T12:00:00Z');
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString();
const HOURS = 14 * 24;

// A soil probe: after a soaking it holds `fc` plus extra water that drains away (×0.8 an hour),
// and it dries `dry` points an hour. `soaks` are hours-ago; `noise` is a fixed wobble, no randomness.
function probe(id: string, o: { start?: number; fc?: number; dry?: number; soaks?: number[]; extra?: number; noise?: number } = {}): SensorSeries {
  const { start = 26, fc = 32, dry = 0.04, soaks = [], extra = 6, noise = 0.15 } = o;
  let base = start;
  let excess = 0;
  const points: Point[] = [];
  for (let ago = HOURS - 1; ago >= 0; ago--) {
    if (soaks.includes(ago)) {
      base = fc;
      excess += extra;
    }
    base -= dry;
    excess *= 0.8;
    points.push({ time: at(ago), value: Math.round((base + excess + noise * Math.sin(ago * 1.7)) * 10) / 10 });
  }
  return { sensorId: id, sensorName: `${id} probe`, points };
}

function weather(rain: Record<number, number> = {}, et0PerHour = 0.05): WeatherHour[] {
  const out: WeatherHour[] = [];
  for (let ago = HOURS - 1; ago >= 0; ago--) out.push({ time: at(ago), rainMm: rain[ago] ?? 0, et0Mm: et0PerHour });
  return out;
}

const replace = (s: SensorSeries, fn: (p: Point, agoIndex: number) => number): SensorSeries => ({
  ...s,
  points: s.points.map((p, i) => ({ ...p, value: fn(p, s.points.length - 1 - i) })),
});

// ---- sensor health (R-022) ----

test('health: a probe stuck on one value for a day, an impossible value, and a dry spike are faulty', () => {
  const stuck = replace(probe('A'), (p, ago) => (ago < 30 ? 21.4 : p.value));
  const impossible = replace(probe('B'), (p, ago) => (ago === 0 ? 85 : p.value));
  const spike = replace(probe('C'), (p, ago) => (ago === 10 ? 90 : p.value));
  const h = sensorHealth([stuck, impossible, spike, probe('D')], weather(), now);
  assert.deepEqual(h.map((x) => x.status), ['faulty', 'faulty', 'faulty', 'ok']);
  assert.match(h[0].reason!, /exactly 21.4%/);
  assert.match(h[1].reason!, /85%/);
  assert.match(h[2].reason!, /jumped to 90%.*no rain/);
});

test('health: a spike during rain is not a fault; a sensor far from three neighbours is "check", two sensors are never compared', () => {
  const spike = replace(probe('C'), (p, ago) => (ago === 10 ? 90 : p.value));
  assert.equal(sensorHealth([spike], weather({ 10: 4 }), now)[0].status, 'ok');

  const steady = (id: string, start: number) => probe(id, { start, dry: 0.01 });
  const dry = steady('D', 14);
  const four = sensorHealth([steady('A', 26), steady('B', 27), steady('C', 26), dry], weather(), now);
  assert.deepEqual(four.map((x) => x.status), ['ok', 'ok', 'ok', 'check']);
  assert.match(four[3].reason!, /points drier than the field's other sensors/);
  assert.deepEqual(sensorHealth([steady('A', 26), dry], weather(), now).map((x) => x.status), ['ok', 'ok']);
});

// ---- wetting events (R-023) ----

test('events: a rise with no rain is irrigation; a rise during rain is rain; last watered is the irrigation', () => {
  const sensors = [probe('A', { soaks: [200, 60] }), probe('B', { soaks: [200, 60] })];
  const events = detectWettingEvents(sensors, weather({ 201: 4, 200: 5, 199: 3 }), {});
  assert.equal(events.length, 2, 'the two sensors rise together: one event each time');
  assert.deepEqual(events.map((e) => [e.label, e.confidence]), [['rain', 'high'], ['irrigation', 'high']]);
  assert.equal(events[0].rainMm, 12);
  assert.equal(events[1].rises.length, 2);
  assert.ok(events[1].rises.every((r) => r.rise > 4 && !r.low));
  assert.equal(lastWatered(events), events[1].start);
  assert.ok(Math.abs(Date.parse(events[1].start) - Date.parse(at(60))) <= 2 * HOUR, `start ${events[1].start}`);
});

test('events: far more rise than the rain explains is irrigation with low confidence; a probe that barely rose is flagged', () => {
  const sensors = [probe('A', { soaks: [60], extra: 12 }), probe('B', { soaks: [60], extra: 12 }), probe('C', { start: 30, fc: 20, soaks: [60], extra: 0.5 })];
  const [e] = detectWettingEvents(sensors, weather({ 61: 1.5 }), {});
  assert.deepEqual([e.label, e.confidence], ['irrigation', 'low']);
  assert.deepEqual(e.rises.map((r) => r.low), [false, false, true]);
});

test("events: the farmer's label replaces ours (matched within 3 hours), and ours is kept as `detected`", () => {
  const sensors = [probe('A', { soaks: [60] })];
  const [auto] = detectWettingEvents(sensors, weather(), {});
  const near = new Date(Date.parse(auto.start) + 2 * HOUR).toISOString();
  const [e] = detectWettingEvents(sensors, weather(), { [near]: 'rain' });
  assert.deepEqual([e.label, e.detected, e.source], ['rain', 'irrigation', 'farmer']);
  assert.equal(lastWatered([e]), null, 'relabelled rain is not a watering');
});

test('events: a steadily drying field has none', () => {
  assert.deepEqual(detectWettingEvents([probe('A'), probe('B')], weather(), {}), []);
});

// ---- field capacity and the suggested trigger (R-024) ----

test('capacity: measured where the soil settles after a soaking, close to the true value', () => {
  const sensors = [probe('A', { fc: 32, soaks: [100] }), probe('B', { fc: 31, soaks: [100] })];
  const events = detectWettingEvents(sensors, weather(), {});
  const { capacity, needs } = estimateFieldCapacity(sensors, events);
  assert.equal(needs, null);
  assert.ok(capacity && Math.abs(capacity.value - 31.5) <= 1.5, `got ${capacity?.value}`);
  assert.match(capacity!.basis, /^the irrigation on Nov \d+, 2 sensors$/);
});

test('capacity: says what it is waiting for', () => {
  assert.equal(estimateFieldCapacity([probe('A')], []).needs, 'a soaking rain or irrigation');
  const late = [probe('A', { soaks: [5] })];
  assert.match(estimateFieldCapacity(late, detectWettingEvents(late, weather(), {})).needs!, /dry day or two/);
});

test('trigger: FAO-56 math for blueberries on sandy loam, and what it needs otherwise', () => {
  const capacity = { value: 32, from: at(100), basis: 'the irrigation on Nov 16, 2 sensors', samples: 2 };
  const { suggestion } = suggestTrigger(capacity, 'Sandy loam, mulched', 'blueberry');
  // wilting point 32 × 0.11/0.23 = 15.3; trigger 32 − 0.5 × (32 − 15.3) = 23.65
  assert.deepEqual([suggestion!.value, suggestion!.wiltingPoint, suggestion!.depletion], [24, 15.3, 0.5]);
  assert.match(suggestion!.basis, /field capacity 32% after the irrigation on Nov 16.*sandy loam.*Berries \(bushes\) can use 50%/);
  assert.match(suggestTrigger(capacity, 'Clay loam', 'blueberry').needs!, /^a soil type \(one of: sand/);
  assert.match(suggestTrigger(capacity, 'Loam', 'kiwi').needs!, /allowable depletion/);
  assert.deepEqual(suggestTrigger(null, 'Loam', 'wheat'), { suggestion: null, needs: null });
});

test('textures are read from free-text soil types, longest name first, unlisted ones refused', () => {
  const t = (s: string) => textureOf(s)?.name ?? null;
  assert.deepEqual(
    ['Sandy loam, mulched', 'Loam', 'silt clay loam', 'Silty clay', 'Clay', 'Clay loam', 'Sandy clay loam', 'peat'].map(t),
    ['sandy loam', 'loam', 'silty clay loam', 'silty clay', 'clay', null, null, null],
  );
});

// ---- drying fit and the water-by window (R-025) ----

test('drying: learns k and c from history with varying ET0, ignoring hours around wetting', () => {
  // ET0 follows a daily cycle; the soil loses 0.5 points per mm of ET0 plus 0.02 an hour.
  const wx = weather();
  wx.forEach((w, i) => (w.et0Mm = Math.max(0, 0.15 * Math.sin(((i % 24) - 6) / 24 * 2 * Math.PI))));
  let v = 30;
  const points = wx.map((w) => {
    v -= 0.5 * w.et0Mm + 0.02;
    return { time: w.time, value: v };
  });
  const fit = fitDrying(points, wx, [])!;
  assert.ok(Math.abs(fit.k - 0.5) < 0.05 && Math.abs(fit.c - 0.02) < 0.005, JSON.stringify(fit));
  assert.equal(fitDrying(points.slice(-9), wx, []), null, 'under a day of data');
});

test('water by: a window around the expected hour, later with forecast rain, now, beyond, or learning', () => {
  const fit = { k: 0, c: 0.1, spread: 0.2, blocks: 40 };
  const outlook: ForecastHour[] = Array.from({ length: 120 }, (_, i) => ({ time: new Date(now.getTime() + (i + 1) * HOUR).toISOString(), tempC: 10, rainMm: 0, et0Mm: 0.05 }));
  const r = waterBy(30, 24, fit, outlook);
  assert.equal(r.kind, 'window');
  if (r.kind !== 'window') return;
  const hoursTo = (iso: string) => (Date.parse(iso) - now.getTime()) / HOUR;
  // 6 points at 0.1 an hour is 60 hours; ±20% gives 50 to 75 hours.
  assert.deepEqual([hoursTo(r.window.earliest), hoursTo(r.window.latest), r.window.ifNoRain], [50, 75, null]);

  const rainy = outlook.map((h, i) => (i === 20 ? { ...h, rainMm: 3 } : h));
  const wet = waterBy(30, 24, fit, rainy);
  assert.ok(wet.kind === 'window' && wet.window.ifNoRain !== null && hoursTo(wet.window.ifNoRain) === 60, 'rain pushes it later');

  assert.equal(waterBy(23, 24, fit, outlook).kind, 'now');
  assert.deepEqual(waterBy(40, 24, fit, outlook), { kind: 'beyond', days: 5 });
  assert.equal(waterBy(30, 24, null, outlook).kind, 'learning');
});
