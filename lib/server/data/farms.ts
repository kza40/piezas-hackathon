// Farms and fields. Every function takes the signed-in farmer's id and only ever sees their records.
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { AppError, badRequest } from '../errors';
import { number, object, optional, text } from '../validate';
import { withLock } from '../lock';
import { getCropProfile, type CropProfile } from './crops';
import { getOwned, listAll, num, oldestFirst, str } from './records';
import { deleteFieldSensors } from './sensors';
import { closeOpenAlertForSettings, deleteFieldAlerts, withFieldAlertsLock } from './alerts';
import { FEEDBACK_MATCH_HOURS } from '../../ml/events';

export interface Farm {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  demoWeather: boolean; // a demo farm's weather is scripted (lib/weather/demo.ts); set only by scripts/seed-demo.ts
  createdAt: string;
}
export interface Field {
  id: string;
  farmId: string;
  name: string;
  cropProfile: CropProfile | null;
  acres: number | null;
  stage: string; // growth stage, "" when not set
  soil: string; // soil type, "" when not set
  irrigated: boolean; // R-021: false (rain-fed) until the farmer says otherwise
  trigger: SavedTrigger | null; // R-009: the farmer's soil-moisture trigger for this field
  eventFeedback: Record<string, EventLabel>; // R-023: the farmer's labels for detected wetting events, by event start
  boundary: FieldBoundary | null;
  createdAt: string;
}

export type EventLabel = 'irrigation' | 'rain' | 'none';
export type FieldBoundary = [number, number][];
export interface SavedTrigger {
  value: number; // soil moisture %, on the field's sensors' own scale
  source: 'suggested' | 'manual';
  basis: string; // what it came from, shown to the farmer
  savedAt: string;
}

const toFarm = (r: EntityRecord): Farm => ({
  id: r.id,
  name: str(r.data.name),
  latitude: num(r.data.latitude),
  longitude: num(r.data.longitude),
  demoWeather: r.data.demoWeather === true,
  createdAt: r.createdAt,
});

export function parseFarmInput(body: unknown) {
  const b = object(body);
  return {
    name: text('Farm name', b.name),
    latitude: number('Latitude', b.latitude, { min: -90, max: 90 }),
    longitude: number('Longitude', b.longitude, { min: -180, max: 180 }),
  };
}

export async function createFarm(ownerId: string, body: unknown): Promise<Farm> {
  const input = parseFarmInput(body);
  const { farm } = await db();
  return toFarm(await farm.create({ title: input.name, data: { ownerId, ...input } }));
}

export async function listFarms(ownerId: string): Promise<Farm[]> {
  const { farm } = await db();
  return (await listAll(farm, { ownerId })).map(toFarm).sort(oldestFirst);
}

export async function getFarm(ownerId: string, farmId: string): Promise<Farm> {
  const { farm } = await db();
  return toFarm(await getOwned(farm, farmId, ownerId, 'Farm'));
}

export function parseFieldInput(body: unknown) {
  const b = object(body);
  const cropProfileId = typeof b.cropProfileId === 'string' ? b.cropProfileId : '';
  if (!cropProfileId) throw badRequest('Choose a crop for the field.');
  return {
    name: text('Field name', b.name),
    cropProfileId,
    acres: optional(b.acres, (v) => number('Acres', v, { min: 0.1, max: 100_000 })),
    stage: optional(b.stage, (v) => text('Growth stage', v, { max: 60 })),
    soil: optional(b.soil, (v) => text('Soil type', v, { max: 60 })),
  };
}

const isNotFound = (e: unknown) => e instanceof AppError && e.status === 404;

// Crop profiles are few, so one lookup per distinct profile is cheap.
// A deleted profile shows as null; any other failure is a real error and is thrown.
async function withCrops(records: EntityRecord[]): Promise<Field[]> {
  const ids = [...new Set(records.map((r) => str(r.data.cropProfileId)).filter(Boolean))];
  const crops = new Map<string, CropProfile | null>();
  await Promise.all(
    ids.map(async (id) =>
      crops.set(
        id,
        await getCropProfile(id).catch((e) => {
          if (isNotFound(e)) return null;
          throw e;
        }),
      ),
    ),
  );
  return records.map((r) => ({
    id: r.id,
    farmId: str(r.data.farmId),
    name: str(r.data.name),
    cropProfile: crops.get(str(r.data.cropProfileId)) ?? null,
    acres: num(r.data.acres),
    stage: str(r.data.stage),
    soil: str(r.data.soil),
    irrigated: r.data.irrigated === true,
    trigger: storedTrigger(r.data.trigger),
    eventFeedback: storedFeedback(r.data.eventFeedback),
    boundary: storedBoundary(r.data.boundary),
    createdAt: r.createdAt,
  }));
}

// Field settings are kept as undeclared JSON on the field record (docs/backend-notes.md E3), so the
// stored schema does not change. Anything malformed reads as unset.
const LABELS: EventLabel[] = ['irrigation', 'rain', 'none'];

function storedTrigger(v: unknown): SavedTrigger | null {
  const t = v as Partial<SavedTrigger> | null;
  if (!t || typeof t.value !== 'number' || typeof t.savedAt !== 'string') return null;
  return { value: t.value, source: t.source === 'suggested' ? 'suggested' : 'manual', basis: str(t.basis), savedAt: t.savedAt };
}

function storedFeedback(v: unknown): Record<string, EventLabel> {
  if (typeof v !== 'object' || v === null) return {};
  return Object.fromEntries(Object.entries(v).filter(([, l]) => LABELS.includes(l as EventLabel))) as Record<string, EventLabel>;
}

/** Most points a saved field boundary may have: plenty for a surveyed field, and it goes out with every field list. */
export const MAX_BOUNDARY_POINTS = 500;

// A boundary as stored: a ring of at least 3 [lng, lat] points, or null for anything else (including too many points).
function storedBoundary(v: unknown): FieldBoundary | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > MAX_BOUNDARY_POINTS) return null;
  const ring: FieldBoundary = [];
  for (const pt of v) {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
    ring.push([lng, lat]);
  }
  return ring;
}

/** How far a field's boundary may reach from its farm's location: catches swapped or mistyped coordinates. */
export const MAX_BOUNDARY_KM = 5;
const M_PER_DEG_LAT = 111_320;

// A saved boundary must lie around its farm: a ring 50 km away (or with longitude and latitude swapped) would be
// drawn off the map, where the farmer can't see or click it. A farm without a location can't be checked.
function checkBoundaryNearFarm(ring: FieldBoundary, farm: Farm) {
  if (farm.latitude == null || farm.longitude == null) return;
  const cosLat = Math.cos((farm.latitude * Math.PI) / 180);
  const far = ring.some(([lng, lat]) => Math.hypot((lng - farm.longitude!) * cosLat, lat - farm.latitude!) * M_PER_DEG_LAT > MAX_BOUNDARY_KM * 1000);
  if (far) throw badRequest(`The boundary must be within ${MAX_BOUNDARY_KM} km of the farm's location. Check that each point is [longitude, latitude].`);
}

// Read-modify-writes of one field's settings run one at a time (Piezas has no optimistic locking, E13).
const withFieldLock = <T>(fieldId: string, fn: () => Promise<T>) => withLock(`field:${fieldId}`, fn);

export function parseFieldSettings(body: unknown, now: Date) {
  const b = object(body);
  const patch: Record<string, unknown> = {};
  if (b.irrigated !== undefined) {
    if (typeof b.irrigated !== 'boolean') throw badRequest('irrigated must be true or false.');
    patch.irrigated = b.irrigated;
  }
  if (b.stage !== undefined) patch.stage = b.stage === null || b.stage === '' ? '' : text('Growth stage', b.stage, { max: 60 });
  if (b.soil !== undefined) patch.soil = b.soil === null || b.soil === '' ? '' : text('Soil type', b.soil, { max: 60 });
  if (b.boundary !== undefined) {
    if (b.boundary === null) patch.boundary = [];
    else {
      const ring = storedBoundary(b.boundary);
      if (!ring) throw badRequest(`boundary must be a list of 3 to ${MAX_BOUNDARY_POINTS} [longitude, latitude] points.`);
      patch.boundary = ring;
    }
  }
  if (b.trigger !== undefined) {
    if (b.trigger === null) patch.trigger = {}; // cleared: reads as unset
    else {
      const t = object(b.trigger);
      patch.trigger = {
        value: number('Trigger', t.value, { min: 1, max: 80 }),
        source: t.source === 'suggested' ? 'suggested' : 'manual',
        basis: optional(t.basis, (v) => text('Trigger basis', v, { max: 200 })) ?? 'Set by you',
        savedAt: now.toISOString(),
      } satisfies SavedTrigger;
    }
  }
  if (!Object.keys(patch).length) throw badRequest('Nothing to change: send irrigated, stage, soil, trigger or boundary.');
  return patch;
}

// PATCH /api/fields/:id
export async function updateFieldSettings(ownerId: string, fieldId: string, body: unknown, now = new Date()): Promise<Field> {
  const patch = parseFieldSettings(body, now);
  const { field } = await db();
  const updated = await withFieldLock(fieldId, async () => {
    const rec = await getOwned(field, fieldId, ownerId, 'Field');
    if (Array.isArray(patch.boundary) && patch.boundary.length) checkBoundaryNearFarm(patch.boundary as FieldBoundary, await getFarm(ownerId, str(rec.data.farmId)));
    return (await withCrops([await field.update(fieldId, { data: patch })]))[0];
  });
  // After the field lock is released: deleteField takes the alerts lock first, so never hold both.
  if ('irrigated' in patch || 'trigger' in patch) await closeOpenAlertForSettings(ownerId, fieldId, now);
  return updated;
}

const FEEDBACK_DAYS = 14; // detected events only go back as far as the reading history

// POST /api/fields/:id/events/:start/feedback  { label: 'irrigation' | 'rain' | 'none' | null }
// null removes the farmer's label, so the app's own label shows again.
export async function setEventFeedback(ownerId: string, fieldId: string, startParam: string, body: unknown, now = new Date()): Promise<Field> {
  const t = Date.parse(startParam);
  if (!Number.isFinite(t)) throw badRequest('The event start must be a date and time.');
  const start = new Date(t).toISOString();
  const raw = object(body).label;
  if (raw !== null && !LABELS.includes(raw as EventLabel)) throw badRequest('label must be irrigation, rain, none or null.');
  const { field } = await db();
  return withFieldLock(fieldId, async () => {
    const r = await getOwned(field, fieldId, ownerId, 'Field');
    const cutoff = now.getTime() - FEEDBACK_DAYS * 86_400_000;
    // A new label replaces any within the matching window, so an older one can never shadow it.
    const near = (k: string) => Math.abs(Date.parse(k) - t) <= FEEDBACK_MATCH_HOURS * 3_600_000;
    const feedback = Object.fromEntries(Object.entries(storedFeedback(r.data.eventFeedback)).filter(([k]) => Date.parse(k) >= cutoff && !near(k)));
    if (raw !== null) feedback[start] = raw as EventLabel;
    return (await withCrops([await field.update(fieldId, { data: { eventFeedback: feedback } })]))[0];
  });
}

export async function createField(ownerId: string, farmId: string, body: unknown): Promise<Field> {
  const input = parseFieldInput(body);
  await getFarm(ownerId, farmId); // 404 if the farm is not this farmer's
  await getCropProfile(input.cropProfileId).catch((e) => {
    throw isNotFound(e) ? badRequest('That crop is not available.') : e;
  });
  const { field } = await db();
  const r = await field.create({ title: input.name, data: { ownerId, farmId, ...input } });
  return (await withCrops([r]))[0];
}

export async function listFields(ownerId: string, farmId: string): Promise<Field[]> {
  await getFarm(ownerId, farmId);
  const { field } = await db();
  const records = await listAll(field, { ownerId, farmId });
  return (await withCrops(records)).sort(oldestFirst);
}

export async function getField(ownerId: string, fieldId: string): Promise<Field> {
  const { field } = await db();
  return (await withCrops([await getOwned(field, fieldId, ownerId, 'Field')]))[0];
}

// Children first (sensors with their history, then alerts), so a failure part-way leaves the field
// in place and a retry finishes the job. The field itself goes last, inside the alerts lock, so the
// advice rule cannot open an alert between the alerts being removed and the field being removed.
export async function deleteField(ownerId: string, fieldId: string): Promise<void> {
  const { field } = await db();
  await getOwned(field, fieldId, ownerId, 'Field'); // 404 if missing or someone else's
  await deleteFieldSensors(ownerId, fieldId);
  await withFieldAlertsLock(fieldId, async () => {
    await deleteFieldAlerts(ownerId, fieldId);
    await field.delete(fieldId);
  });
}
