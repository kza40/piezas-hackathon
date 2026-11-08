// The six reading types (SPEC R-013), each in one fixed unit, and the check for what a device sends.
// Pure: no I/O, so it is unit-tested directly. Adding a type is one line in READING_TYPES.
import { badRequest } from './errors';
import { object } from './validate';

// min/max are what the physical sensor can report, not what is healthy: a glitch inside these
// bounds (soil moisture 90 %) is accepted and left to the advice rules; 400 % is rejected.
export const READING_TYPES = {
  soil_moisture: { unit: '%', min: 0, max: 100 },
  soil_temperature: { unit: 'C', min: -40, max: 80 },
  soil_ec: { unit: 'dS/m', min: 0, max: 20 },
  soil_ph: { unit: 'pH', min: 0, max: 14 },
  air_temperature: { unit: 'C', min: -60, max: 60 },
  air_humidity: { unit: '%', min: 0, max: 100 },
} as const;

export type ReadingType = keyof typeof READING_TYPES;
export interface Reading {
  type: ReadingType;
  value: number;
  time: string; // ISO 8601 UTC, normalised
}

export const MAX_BATCH = 50;
const MAX_FUTURE_MS = 10 * 60 * 1000; // device clocks drift a little; more than that is a bad clock
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const isType = (t: unknown): t is ReadingType => typeof t === 'string' && Object.hasOwn(READING_TYPES, t);

export function parseReading(v: unknown, now: Date, where = 'Reading'): Reading {
  const r = object(v);
  if (!isType(r.type)) throw badRequest(`${where}: type must be one of ${Object.keys(READING_TYPES).join(', ')}.`);
  const { unit, min, max } = READING_TYPES[r.type];
  if (r.unit !== unit) throw badRequest(`${where}: ${r.type} must be sent in ${unit}.`);
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) throw badRequest(`${where}: value must be a number.`);
  if (r.value < min || r.value > max) throw badRequest(`${where}: ${r.type} must be between ${min} and ${max} ${unit}.`);
  const ms = typeof r.time === 'string' && ISO_WITH_ZONE.test(r.time) ? Date.parse(r.time) : NaN;
  if (Number.isNaN(ms)) throw badRequest(`${where}: time must be an ISO 8601 timestamp with a time zone, e.g. 2026-11-07T18:00:00Z.`);
  if (ms > now.getTime() + MAX_FUTURE_MS) throw badRequest(`${where}: time is in the future; check the device clock.`);
  return { type: r.type, value: r.value, time: new Date(ms).toISOString() };
}

// One reading, or { readings: [...] } with 1 to MAX_BATCH of them. All or nothing: one bad reading rejects the batch.
export function parseIngestBody(body: unknown, now = new Date()): Reading[] {
  const b = object(body);
  if (b.readings === undefined) return [parseReading(b, now)];
  if (!Array.isArray(b.readings) || b.readings.length === 0) throw badRequest('readings must be a non-empty list.');
  if (b.readings.length > MAX_BATCH) throw badRequest(`Send at most ${MAX_BATCH} readings at a time.`);
  return b.readings.map((r, i) => parseReading(r, now, `Reading ${i + 1}`));
}
