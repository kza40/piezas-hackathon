// Sensors, their device keys, and readings coming in from devices (SPEC R-004, R-005, R-013).
// Farmer-facing functions take the signed-in farmer's id; ingest is authenticated by the device key instead.
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { withLock } from '../lock';
import { AppError, unauthorized } from '../errors';
import { object, text } from '../validate';
import { deviceKeyHash, newDeviceKey } from '../device-keys';
import { rateLimiter } from '../rate-limit';
import { READING_TYPES, parseIngestBody, type ReadingType } from '../readings';
import { getOwned, listAll, str } from './records';

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
type StoredLatest = Partial<Record<ReadingType, { value: number; time: string }>>;

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
  return (await listAll(sensor, { ownerId, fieldId })).map(toSensor).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Locked with ingest, so a batch that is mid-way cannot land after the revoke.
export function revokeSensor(ownerId: string, sensorId: string): Promise<Sensor> {
  return withLock(`sensor:${sensorId}`, async () => {
    const { sensor } = await db();
    await getOwned(sensor, sensorId, ownerId, 'Sensor');
    return toSensor(await sensor.update(sensorId, { data: { keyStatus: 'revoked' } }));
  });
}

// Used when a field is removed. (Step 4 adds the sensors' stored readings here.)
export async function deleteFieldSensors(ownerId: string, fieldId: string): Promise<void> {
  const { sensor } = await db();
  for (const r of await listAll(sensor, { ownerId, fieldId })) {
    await withLock(`sensor:${r.id}`, () => sensor.delete(r.id));
  }
}

const BAD_KEY = 'Device key is missing or not valid.';
// 120 requests a minute per device key: an hourly probe sends 1; this only stops a device stuck in a loop.
const perDevice = rateLimiter(120, 60_000);

// POST /api/ingest. Checks the key, then the readings (all or nothing), then keeps each type's newest value.
export async function ingest(deviceKey: unknown, body: unknown): Promise<{ accepted: number }> {
  const hash = deviceKeyHash(deviceKey);
  if (!hash) throw unauthorized(BAD_KEY);
  if (!perDevice(hash)) throw new AppError(429, 'rate_limited', 'Too many requests from this device. Send readings less often.');
  const readings = parseIngestBody(body);

  const { sensor } = await db();
  const found = (await sensor.list({ filter: { keyHash: hash }, limit: 1 })).data[0];
  if (!found) throw unauthorized(BAD_KEY);

  return withLock(`sensor:${found.id}`, async () => {
    // Read again inside the lock: the key may have been revoked, or another batch landed, meanwhile.
    const r = await sensor.get(found.id).catch(() => null);
    if (!r || r.data.keyHash !== hash) throw unauthorized(BAD_KEY);
    if (r.data.keyStatus !== 'active') throw unauthorized('This device key has been revoked.');
    const latest = storedLatest(r.data.latest);
    let changed = false;
    for (const { type, value, time } of readings) {
      // ISO strings in UTC compare correctly as text. Late, older readings never replace newer ones.
      if (!latest[type] || time >= latest[type].time) {
        latest[type] = { value, time };
        changed = true;
      }
    }
    if (changed) await sensor.update(r.id, { data: { latest } });
    return { accepted: readings.length };
  });
}
