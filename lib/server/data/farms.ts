// Farms and fields. Every function takes the signed-in farmer's id and only ever sees their records.
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { AppError, badRequest } from '../errors';
import { number, object, optional, text } from '../validate';
import { getCropProfile, type CropProfile } from './crops';
import { getOwned, listAll, num, str } from './records';
import { deleteFieldSensors } from './sensors';
import { deleteFieldAlerts, withFieldAlertsLock } from './alerts';

export interface Farm {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
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
  createdAt: string;
}

const toFarm = (r: EntityRecord): Farm => ({
  id: r.id,
  name: str(r.data.name),
  latitude: num(r.data.latitude),
  longitude: num(r.data.longitude),
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
  return (await listAll(farm, { ownerId })).map(toFarm).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    createdAt: r.createdAt,
  }));
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
  return (await withCrops(records)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
