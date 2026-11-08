// Pure logic for reading history and the simulator: no network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EntityRecord } from '@piezas/sdk';
import { cutoffDay, groupByDay, mergePoints, seriesFrom } from './data/history';
import { parseReading, READING_TYPES, type Reading } from './readings';
import { simulateSensor } from './simulate';

const now = new Date('2026-11-07T18:30:00Z');
const blueberry = { moistureMin: 35, moistureMax: 50, phMin: 4.5, phMax: 5.5, ecMax: 1 };

test('points merge by time: a resent time is replaced, the result is sorted', () => {
  const a = { t: '2026-11-07T10:00:00.000Z', v: 30, src: 'real' as const };
  const b = { t: '2026-11-07T09:00:00.000Z', v: 31, src: 'real' as const };
  const merged = mergePoints([a], [b, { ...a, v: 29 }]);
  assert.deepEqual(merged.map((p) => [p.t.slice(11, 13), p.v]), [['09', 31], ['10', 29]]);
});

test('a full 14 x 24 hours is kept; older readings are accepted but not stored', () => {
  assert.equal(cutoffDay(now), '2026-10-24'); // 14 days before 2026-11-07T18:30Z is 2026-10-24T18:30Z
  const r = (time: string): Reading => ({ type: 'soil_ph', value: 5, time });
  const groups = groupByDay([r('2026-11-07T01:00:00.000Z'), r('2026-10-24T19:00:00.000Z'), r('2026-10-23T23:00:00.000Z')], 'real', now);
  assert.deepEqual([...groups.keys()].sort(), ['soil_ph|2026-10-24', 'soil_ph|2026-11-07']);
  // Everything the simulator writes is kept: its first hour is inside the window.
  const sim = simulateSensor('sensor-a', blueberry, -122.3, now);
  const kept = [...groupByDay(sim, 'simulated', now).values()].reduce((n, pts) => n + pts.length, 0);
  assert.equal(kept, sim.length);
});

test('series read back oldest first from `since`, and flag simulated points', () => {
  const rec = (day: string, type: string, values: unknown[]) => ({ data: { day, readingType: type, values } }) as unknown as EntityRecord;
  const records = [
    rec('2026-11-07', 'soil_moisture', [{ t: '2026-11-07T02:00:00.000Z', v: 33, src: 'real' }]),
    rec('2026-11-06', 'soil_moisture', [
      { t: '2026-11-06T01:00:00.000Z', v: 30, src: 'simulated' },
      { t: '2026-11-06T20:00:00.000Z', v: 31, src: 'real' },
    ]),
    rec('2026-11-07', 'light', [{ t: '2026-11-07T02:00:00.000Z', v: 9, src: 'real' }]), // unknown type is ignored
    rec('2026-11-07', 'soil_ph', [{ t: 'bad', v: 'x' }]), // malformed points are ignored
  ];
  const { series, simulated } = seriesFrom(records, '2026-11-06T12:00:00.000Z');
  assert.deepEqual(series, {
    soil_moisture: [
      { time: '2026-11-06T20:00:00.000Z', value: 31 },
      { time: '2026-11-07T02:00:00.000Z', value: 33 },
    ],
  });
  assert.equal(simulated, false, 'the simulated point is before `since`');
  assert.equal(seriesFrom(records, '2026-11-01T00:00:00.000Z').simulated, true);
});

test('the simulator gives 14 days of hourly readings of all six types, each one a valid device reading', () => {
  const rs = simulateSensor('sensor-a', blueberry, -122.3, now);
  assert.equal(rs.length, 14 * 24 * 6);
  assert.deepEqual([...new Set(rs.map((r) => r.type))].sort(), Object.keys(READING_TYPES).sort());
  assert.equal(rs.at(-1)?.time, '2026-11-07T18:00:00.000Z', 'ends at the last full hour');
  for (const r of rs) parseReading({ ...r, unit: READING_TYPES[r.type].unit }, now); // throws if not a valid reading
});

test('the simulator is repeatable per sensor and differs between sensors', () => {
  assert.deepEqual(simulateSensor('sensor-a', blueberry, -122.3, now), simulateSensor('sensor-a', blueberry, -122.3, now));
  assert.notDeepEqual(simulateSensor('sensor-a', blueberry, -122.3, now), simulateSensor('sensor-b', blueberry, -122.3, now));
});

test('simulated weather and soil behave like a real field', () => {
  const rs = simulateSensor('sensor-a', blueberry, -122.3, now);
  const of = (type: string) => rs.filter((r) => r.type === type);
  const localHour = (time: string) => (new Date(time).getUTCHours() - 122.3 / 15 + 24) % 24;
  const avgAt = (type: string, lo: number, hi: number) => {
    const v = of(type).filter((r) => localHour(r.time) >= lo && localHour(r.time) < hi);
    return v.reduce((s, r) => s + r.value, 0) / v.length;
  };
  assert.ok(avgAt('air_temperature', 13, 17) > avgAt('air_temperature', 2, 6) + 8, 'afternoons are warmer than nights (local time)');
  assert.ok(avgAt('air_humidity', 2, 6) > avgAt('air_humidity', 13, 17), 'humidity is highest when it is coldest');

  const ph = of('soil_ph').map((r) => r.value);
  for (let i = 24; i < ph.length; i += 24) assert.ok(Math.abs(ph[i] - ph[i - 24]) <= 0.06, 'pH changes about 0.05 a day at most');
  const moisture = of('soil_moisture').map((r) => r.value);
  assert.ok(moisture.some((v, i) => i > 0 && v - moisture[i - 1] > 4), 'moisture jumps after rain or irrigation');
  assert.ok(moisture.some((v, i) => i > 0 && v < moisture[i - 1]), 'and dries in between');
  const air = of('air_temperature').map((r) => r.value);
  const soil = of('soil_temperature').map((r) => r.value);
  const swing = (v: number[]) => Math.max(...v.slice(-24)) - Math.min(...v.slice(-24));
  assert.ok(swing(soil) < swing(air), 'soil temperature is smoother than air temperature');
});

test('across many spots the simulator gives some dry fields and mostly healthy ones (the demo needs both)', () => {
  const ends = Array.from({ length: 60 }, (_, i) => simulateSensor(`spot-${i}`, blueberry, -122.3, now).filter((r) => r.type === 'soil_moisture').at(-1)!.value);
  const dry = ends.filter((v) => v < 35).length;
  const inRange = ends.filter((v) => v >= 35 && v <= 50).length;
  assert.ok(dry >= 6 && dry <= 30, `about a quarter dry, got ${dry} of 60`);
  assert.ok(inRange >= 30, `most in range, got ${inRange} of 60`);
});
