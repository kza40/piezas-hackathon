// Sensors, their device keys, and readings coming in from devices (SPEC R-004, R-005, R-013).
// Farmer-facing functions take the signed-in farmer's id; ingest is authenticated by the device key instead.
import type { EntityRecord } from '@piezas/sdk';
import { db, errorCode } from '../piezas';
import { withLock } from '../lock';
import { AppError, badRequest, unauthorized } from '../errors';
import { number, object, text } from '../validate';
import { deviceKeyHash, newDeviceKey } from '../device-keys';
import { rateLimiter } from '../rate-limit';
import { READING_TYPES, parseIngestBody, type Reading, type ReadingType } from '../readings';
import { getOwned, listAll, num, oldestFirst, str } from './records';
import { getCropProfile } from './crops';
import { appendHistory, deleteSensorHistory, replaceHistory, RETENTION_DAYS, sensorHistory, type Series } from './history';
import { simulateSensor } from '../simulate';

export interface LatestReading {
  value: number;
  unit: string;
  time: string;
}
export interface Sensor {
  id: string;
  fieldId: string;
  name: string;
  keyStatus: 'active' | 'revoked';
  // The newest reading of each type this sensor has sent; a sensor shows whatever types it reports.
  latest: Partial<Record<ReadingType, LatestReading>>;
  createdAt: string;
}

// Stored on the sensor as undeclared JSON (docs/backend-notes.md E3): { soil_moisture: { value, time }, ... }
export type StoredLatest = Partial<Record<ReadingType, { value: number; time: string }>>;

function storedLatest(v: unknown): StoredLatest {
  const out: StoredLatest = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const type of Object.keys(READING_TYPES) as ReadingType[]) {
    const r = (v as Record<string, unknown>)[type] as { value?: unknown; time?: unknown } | undefined;
    if (r && typeof r.value === 'number' && typeof r.time === 'string') out[type] = { value: r.value, time: r.time };
  }
  return out;
}

const toSensor = (r: EntityRecord): Sensor => ({
  id: r.id,
  fieldId: str(r.data.fieldId),
  name: str(r.data.name),
  keyStatus: r.data.keyStatus === 'active' ? 'active' : 'revoked',
  latest: Object.fromEntries(
    Object.entries(storedLatest(r.data.latest)).map(([type, l]) => [type, { ...l, unit: READING_TYPES[type as ReadingType].unit }]),
  ),
  createdAt: r.createdAt,
});

export function parseSensorInput(body: unknown) {
  return { name: text('Sensor name', object(body).name, { max: 60 }) };
}

async function ownedField(ownerId: string, fieldId: string) {
  const { field } = await db();
  await getOwned(field, fieldId, ownerId, 'Field'); // 404 if missing or someone else's
}

// Returns the device key once; only its hash is kept.
export async function createSensor(ownerId: string, fieldId: string, body: unknown): Promise<{ sensor: Sensor; deviceKey: string }> {
  const input = parseSensorInput(body);
  await ownedField(ownerId, fieldId);
  const { sensor } = await db();
  const { key, hash } = newDeviceKey();
  const r = await sensor.create({ title: input.name, data: { ownerId, fieldId, ...input, keyHash: hash, keyStatus: 'active' } });
  return { sensor: toSensor(r), deviceKey: key };
}

export async function listSensors(ownerId: string, fieldId: string): Promise<Sensor[]> {
  await ownedField(ownerId, fieldId);
  const { sensor } = await db();
  return (await listAll(sensor, { ownerId, fieldId })).map(toSensor).sort(oldestFirst);
}

// No lock needed: this writes only keyStatus, and Piezas merges top-level keys, so it cannot clash
// with ingest writing `latest`. A batch already past its key check when the revoke lands still saves.
export async function revokeSensor(ownerId: string, sensorId: string): Promise<Sensor> {
  const { sensor } = await db();
  await getOwned(sensor, sensorId, ownerId, 'Sensor');
  return toSensor(await sensor.update(sensorId, { data: { keyStatus: 'revoked' } }));
}

// Used when a field is removed. History first, then the sensor, so a failure part-way can be retried;
// under the device lock, so a batch already past its key check cannot write history after it is gone.
export async function deleteFieldSensors(ownerId: string, fieldId: string): Promise<void> {
  const { sensor } = await db();
  for (const r of await listAll(sensor, { ownerId, fieldId })) {
    await withLock(`device:${str(r.data.keyHash)}`, async () => {
      await deleteSensorHistory(ownerId, r.id);
      await sensor.delete(r.id);
    });
  }
}

// POST /api/fields/:id/simulate (S-006): replaces each sensor's history with 14 days of simulated readings
// for this field's crop, ending now, and sets its latest values. A demo tool: real history is overwritten.
export async function simulateField(ownerId: string, fieldId: string, now = new Date()): Promise<Sensor[]> {
  const { field, farm, sensor } = await db();
  const f = await getOwned(field, fieldId, ownerId, 'Field');
  const sensors = await listAll(sensor, { ownerId, fieldId });
  if (!sensors.length) throw badRequest('Register a sensor on this field first.');
  // A deleted crop profile simulates with generic ranges; any other failure is a real error.
  const crop = await getCropProfile(str(f.data.cropProfileId)).catch((e) => {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  });
  const farmRec = await getOwned(farm, str(f.data.farmId), ownerId, 'Farm');
  const longitude = num(farmRec.data.longitude) ?? 0;
  const out: Sensor[] = [];
  for (const s of sensors) {
    out.push(
      await withLock(`device:${str(s.data.keyHash)}`, async () => {
        const readings = simulateSensor(s.id, crop ?? { moistureMin: null, moistureMax: null, phMin: null, phMax: null, ecMax: null }, longitude, now, RETENTION_DAYS);
        await replaceHistory(ownerId, s.id, readings, 'simulated', now);
        return toSensor(await sensor.update(s.id, { data: { latest: mergeLatest({}, readings).latest } }));
      }),
    );
  }
  return out.sort(oldestFirst);
}

export interface SensorReadings {
  sensorId: string;
  simulated: boolean; // true when any point shown came from the simulator
  series: Series;
}

// GET /api/fields/:id/readings?days=7 (R-007): each sensor's points per type for the last `days` days.
export async function fieldReadings(ownerId: string, fieldId: string, daysParam: unknown, now = new Date()): Promise<{ days: number; sensors: SensorReadings[] }> {
  const days = daysParam === undefined ? 7 : number('days', daysParam, { min: 1, max: RETENTION_DAYS });
  if (!Number.isInteger(days)) throw badRequest('days must be a whole number.');
  const sensors = await listSensors(ownerId, fieldId); // 404 if the field is not this farmer's
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  return {
    days,
    sensors: await Promise.all(sensors.map(async (s) => ({ sensorId: s.id, ...(await sensorHistory(ownerId, s.id, since)) }))),
  };
}

// The newest value of each type wins; a late, older reading never replaces a newer one.
// (Times are normalised UTC ISO strings, so they compare correctly as text.)
export function mergeLatest(latest: StoredLatest, readings: Reading[]): { latest: StoredLatest; changed: boolean } {
  const next = { ...latest };
  let changed = false;
  for (const { type, value, time } of readings) {
    const cur = next[type];
    if (!cur || time >= cur.time) {
      next[type] = { value, time };
      changed = true;
    }
  }
  return { latest: next, changed };
}

const BAD_KEY = 'Device key is missing or not valid.';
// 120 requests a minute per device key: an hourly probe sends 1; this only stops a device stuck in a loop.
const perDevice = rateLimiter(120, 60_000);

export interface IngestSaved {
  ownerId: string;
  fieldId: string;
  readings: Reading[];
}

// POST /api/ingest. Checks the key, then the readings (all or nothing), then keeps each type's newest value.
// `onSaved` runs after the device lock is released, and the device's response does not wait for it.
export async function ingest(deviceKey: unknown, body: unknown, onSaved?: (saved: IngestSaved) => void): Promise<{ accepted: number }> {
  const hash = deviceKeyHash(deviceKey);
  if (!hash) throw unauthorized(BAD_KEY);
  if (!perDevice(hash)) throw new AppError(429, 'rate_limited', 'Too many requests from this device. Send readings less often.');
  const readings = parseIngestBody(body);

  const { sensor } = await db();
  // One device's batches run one at a time, so the read-modify-write of `latest` never loses a reading.
  const saved = await withLock(`device:${hash}`, async () => {
    const r = (await sensor.list({ filter: { keyHash: hash }, limit: 1 })).data[0];
    if (!r) throw unauthorized(BAD_KEY);
    if (r.data.keyStatus !== 'active') throw unauthorized('This device key has been revoked.');
    // History first: if it fails, the device retries, and the same times simply overwrite (no duplicates).
    await appendHistory(str(r.data.ownerId), r.id, readings, 'real');
    const { latest, changed } = mergeLatest(storedLatest(r.data.latest), readings);
    if (changed) {
      await sensor.update(r.id, { data: { latest } }).catch((e) => {
        throw errorCode(e) === 'not_found' ? unauthorized(BAD_KEY) : e; // the sensor was removed meanwhile
      });
    }
    return { ownerId: str(r.data.ownerId), fieldId: str(r.data.fieldId) };
  });
  onSaved?.({ ...saved, readings });
  return { accepted: readings.length };
}
