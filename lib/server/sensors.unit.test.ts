// Pure logic for sensors and ingest: no network. Run: npm run test:unit
process.env.DEVICE_KEY_PEPPER ??= 'unit-test-pepper-unit-test-pepper-unit-test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors';
import { MAX_BATCH, READING_TYPES, parseIngestBody, parseReading } from './readings';
import { deviceKeyHash, newDeviceKey } from './device-keys';
import { rateLimiter } from './rate-limit';
import { mergeLatest, parseSensorInput } from './data/sensors';

const now = new Date('2026-11-07T18:00:00Z');
const ok = { type: 'soil_moisture', value: 27.4, unit: '%', time: '2026-11-07T17:00:00Z' };

const rejects = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof AppError && e.status === 400 && pattern.test(e.message));

test('each of the six types is accepted in its one fixed unit (S-012)', () => {
  const units = { soil_moisture: '%', soil_temperature: 'C', soil_ec: 'dS/m', soil_ph: 'pH', air_temperature: 'C', air_humidity: '%' };
  assert.deepEqual(Object.fromEntries(Object.entries(READING_TYPES).map(([t, d]) => [t, d.unit])), units);
  for (const [type, unit] of Object.entries(units)) {
    assert.equal(parseReading({ type, unit, value: 5, time: ok.time }, now).type, type);
  }
});

test('an unknown type, a wrong unit or a missing value is rejected', () => {
  rejects(() => parseReading({ ...ok, type: 'light' }, now), /type must be one of/);
  rejects(() => parseReading({ ...ok, type: 'toString' }, now), /type must be one of/); // not fooled by Object.prototype
  rejects(() => parseReading({ ...ok, unit: 'percent' }, now), /must be sent in %/);
  rejects(() => parseReading({ ...ok, type: 'soil_temperature', unit: 'F' }, now), /must be sent in C/);
  rejects(() => parseReading({ ...ok, value: '27.4' }, now), /value must be a number/);
  rejects(() => parseReading({ ...ok, value: null }, now), /value must be a number/);
});

test('values outside what a sensor can report are rejected; a glitch inside the bounds is kept', () => {
  assert.equal(parseReading({ ...ok, value: 90 }, now).value, 90); // story case 8: one-off spike
  rejects(() => parseReading({ ...ok, value: 400 }, now), /between 0 and 100/);
  rejects(() => parseReading({ ...ok, type: 'soil_ph', unit: 'pH', value: 15 }, now), /between 0 and 14/);
  assert.equal(parseReading({ ...ok, type: 'air_temperature', unit: 'C', value: -12 }, now).value, -12);
});

test('time must be ISO 8601 with a zone, is normalised to UTC, and may not be in the future', () => {
  assert.equal(parseReading({ ...ok, time: '2026-11-07T09:30:00-08:00' }, now).time, '2026-11-07T17:30:00.000Z');
  rejects(() => parseReading({ ...ok, time: '2026-11-07T17:00:00' }, now), /time zone/); // local time is ambiguous
  rejects(() => parseReading({ ...ok, time: '2026-11-07' }, now), /ISO 8601/);
  rejects(() => parseReading({ ...ok, time: '2026-13-45T17:00:00Z' }, now), /ISO 8601/);
  assert.ok(parseReading({ ...ok, time: '2026-11-07T18:09:00Z' }, now)); // small clock drift is fine
  rejects(() => parseReading({ ...ok, time: '2026-11-07T19:00:00Z' }, now), /future/);
});

test('ingest takes one reading or a batch, and a batch is all or nothing', () => {
  assert.equal(parseIngestBody(ok, now).length, 1);
  const soil = { ...ok, type: 'soil_ph', unit: 'pH', value: 5.1 };
  assert.equal(parseIngestBody({ readings: [ok, soil] }, now).length, 2);
  rejects(() => parseIngestBody({ readings: [ok, { ...ok, type: 'light' }] }, now), /^Reading 2: /);
  rejects(() => parseIngestBody({ readings: [] }, now), /non-empty/);
  rejects(() => parseIngestBody({ readings: Array(MAX_BATCH + 1).fill(ok) }, now), /at most 50/);
  rejects(() => parseIngestBody([ok], now), /JSON object/);
});

test('device keys are random, well-formed, and only their hash is reproducible', () => {
  const a = newDeviceKey();
  const b = newDeviceKey();
  assert.match(a.key, /^fwk_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.key, b.key);
  assert.equal(deviceKeyHash(a.key), a.hash);
  assert.equal(deviceKeyHash(` ${a.key} `), a.hash); // stray whitespace from copy-paste
  assert.notEqual(a.hash, b.hash);
  for (const junk of [undefined, '', 'fwk_short', `fwk_${'a'.repeat(44)}`, a.key.slice(4), 42]) assert.equal(deviceKeyHash(junk), null);
});

test('the rate limiter allows the limit per window, per key, then resets', () => {
  let t = 0;
  const allow = rateLimiter(2, 1000, () => t);
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
  t = 1000;
  assert.equal(allow('a'), true);
});

test('the newest reading of each type wins, and a late older one changes nothing', () => {
  const stored = { soil_moisture: { value: 30, time: '2026-11-07T17:00:00.000Z' } };
  const r = (type: string, value: number, time: string) => parseReading({ type, value, time, unit: READING_TYPES[type as 'soil_ph'].unit }, now);

  const late = mergeLatest(stored, [r('soil_moisture', 99, '2026-11-07T16:00:00Z')]);
  assert.deepEqual(late, { latest: stored, changed: false });

  const next = mergeLatest(stored, [r('soil_moisture', 31, '2026-11-07T17:30:00Z'), r('soil_ph', 5.1, '2026-11-07T17:30:00Z')]);
  assert.equal(next.changed, true);
  assert.deepEqual(next.latest, {
    soil_moisture: { value: 31, time: '2026-11-07T17:30:00.000Z' },
    soil_ph: { value: 5.1, time: '2026-11-07T17:30:00.000Z' },
  });
  assert.equal(stored.soil_moisture.value, 30, 'the input is not mutated');

  // Within one batch the newest wins too, whatever the order.
  const batch = mergeLatest({}, [r('soil_ph', 5.3, '2026-11-07T17:45:00Z'), r('soil_ph', 5.0, '2026-11-07T17:15:00Z')]);
  assert.equal(batch.latest.soil_ph?.value, 5.3);
});

test('a sensor needs a name of at most 60 characters', () => {
  assert.deepEqual(parseSensorInput({ name: ' Row 3 probe ' }), { name: 'Row 3 probe' });
  rejects(() => parseSensorInput({}), /Sensor name is required/);
  rejects(() => parseSensorInput({ name: 'x'.repeat(61) }), /60 characters/);
});
