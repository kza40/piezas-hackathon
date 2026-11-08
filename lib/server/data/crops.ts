// Crop profiles: shared by all farmers, defined here in code (the farmer only picks one).
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { withLock } from '../lock';
import { getOwned, listAll, str } from './records';

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
const GUIDANCE_VERSION = 2;

// Numeric values here are only values supported by the BC Ministry of Agriculture
// soil-pH preference table. Moisture thresholds need field/sensor calibration; EC
// depends on the soil test method; frost thresholds depend on crop stage. See
// docs/crop-guidance.md. Unknown thresholds stay null so the UI cannot treat a guess
// as an agronomic recommendation. `name` matches the frontend's crop labels.
export const DEFAULT_PROFILES: Defaults[] = [
  { key: 'wheat', name: 'Wheat', moistureMin: null, moistureMax: null, phMin: 5.8, phMax: 6.5, ecMax: null, frostRiskC: null },
  { key: 'canola', name: 'Canola', moistureMin: null, moistureMax: null, phMin: null, phMax: null, ecMax: null, frostRiskC: null },
  { key: 'barley', name: 'Barley', moistureMin: null, moistureMax: null, phMin: 5.8, phMax: 6.5, ecMax: null, frostRiskC: null },
  { key: 'oats', name: 'Oats', moistureMin: null, moistureMax: null, phMin: 5.8, phMax: 6.5, ecMax: null, frostRiskC: null },
  { key: 'alfalfa', name: 'Alfalfa', moistureMin: null, moistureMax: null, phMin: 6.5, phMax: 7.5, ecMax: null, frostRiskC: null },
  { key: 'blueberry', name: 'Blueberries', moistureMin: null, moistureMax: null, phMin: 4.5, phMax: 5.2, ecMax: null, frostRiskC: null },
];

const toCrop = (r: EntityRecord): CropProfile => {
  const key = str(r.data.key);
  // Crop guidance is code-owned. Never expose stale threshold values already stored
  // in Piezas when a source-backed profile replaces the old placeholder profile.
  const defaults = DEFAULT_PROFILES.find((profile) => profile.key === key);
  return {
    id: r.id,
    key,
    name: defaults?.name ?? str(r.data.name),
    moistureMin: defaults?.moistureMin ?? null,
    moistureMax: defaults?.moistureMax ?? null,
    phMin: defaults?.phMin ?? null,
    phMax: defaults?.phMax ?? null,
    ecMax: defaults?.ecMax ?? null,
    frostRiskC: defaults?.frostRiskC ?? null,
  };
};

// Declared fields reject null (docs/backend-notes.md, E17): leave unknown values out instead.
const compact = (d: Defaults) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null));

const sameValues = (r: EntityRecord, d: Defaults) =>
  r.data.guidanceVersion === GUIDANCE_VERSION &&
  (Object.keys(d) as (keyof Defaults)[]).every((k) => d[k] === null || r.data[k] === d[k]);

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
      const data = { ...compact(d), guidanceVersion: GUIDANCE_VERSION };
      if (!r) await crop_profile.create({ title: d.name, data });
      else if (!sameValues(r, d)) await crop_profile.update(r.id, { title: d.name, data });
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
