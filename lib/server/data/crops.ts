// Crop profiles: shared by all farmers, defined here in code (the farmer only picks one).
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { withLock } from '../lock';
import { getOwned, listAll, num, str } from './records';

export interface CropProfile {
  id: string;
  key: string;
  name: string;
  moistureMin: number | null;
  moistureMax: number | null;
  phMin: number | null;
  phMax: number | null;
  ecMax: number | null;
  frostRiskC: number | null;
}

type Defaults = Omit<CropProfile, 'id'>;

// PLACEHOLDER numbers (SPEC R-003): moisture ranges come from the frontend's demo data,
// pH 6 to 7.2 is its "usual" range, blueberry pH and EC from the spec. Check every value
// against an agronomy source before the demo. `name` matches the frontend's crop labels.
const usual = { phMin: 6, phMax: 7.2, ecMax: null, frostRiskC: 0 };
export const DEFAULT_PROFILES: Defaults[] = [
  { key: 'wheat', name: 'Wheat', moistureMin: 30, moistureMax: 45, ...usual },
  { key: 'canola', name: 'Canola', moistureMin: 32, moistureMax: 45, ...usual },
  { key: 'barley', name: 'Barley', moistureMin: 28, moistureMax: 42, ...usual },
  { key: 'oats', name: 'Oats', moistureMin: 28, moistureMax: 42, ...usual },
  { key: 'alfalfa', name: 'Alfalfa', moistureMin: 35, moistureMax: 50, ...usual },
  { key: 'blueberry', name: 'Blueberries', moistureMin: 35, moistureMax: 50, phMin: 4.5, phMax: 5.5, ecMax: 1.0, frostRiskC: 0 },
];

const toCrop = (r: EntityRecord): CropProfile => ({
  id: r.id,
  key: str(r.data.key),
  name: str(r.data.name),
  moistureMin: num(r.data.moistureMin),
  moistureMax: num(r.data.moistureMax),
  phMin: num(r.data.phMin),
  phMax: num(r.data.phMax),
  ecMax: num(r.data.ecMax),
  frostRiskC: num(r.data.frostRiskC),
});

// Declared fields reject null (docs/backend-notes.md, E17): leave unknown values out instead.
const compact = (d: Defaults) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null));

const sameValues = (r: EntityRecord, d: Defaults) =>
  (Object.keys(d) as (keyof Defaults)[]).every((k) => (r.data[k] ?? null) === d[k]);

let ensured = false;

// Makes the stored profiles match DEFAULT_PROFILES (creates missing ones, updates changed values),
// once per process. Locked so concurrent first requests do not create duplicates.
export function ensureCropProfiles(): Promise<void> {
  return withLock('crop_profile:defaults', async () => {
    if (ensured) return;
    const { crop_profile } = await db();
    const byKey = new Map((await listAll(crop_profile, {})).map((r) => [str(r.data.key), r]));
    for (const d of DEFAULT_PROFILES) {
      const r = byKey.get(d.key);
      if (!r) await crop_profile.create({ title: d.name, data: compact(d) });
      else if (!sameValues(r, d)) await crop_profile.update(r.id, { title: d.name, data: compact(d) });
    }
    ensured = true;
  });
}

export async function listCropProfiles(): Promise<CropProfile[]> {
  await ensureCropProfiles();
  const { crop_profile } = await db();
  const order = new Map(DEFAULT_PROFILES.map((d, i) => [d.key, i]));
  return (await listAll(crop_profile, {}))
    .map(toCrop)
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
}

export async function getCropProfile(id: string): Promise<CropProfile> {
  const { crop_profile } = await db();
  return toCrop(await getOwned(crop_profile, id, null, 'Crop profile'));
}
