// Crop profiles: shared by all farmers, created by the app, not by farmers.
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

// PLACEHOLDER numbers (SPEC R-003): check against a BC source before the demo.
export const DEFAULT_PROFILES = [
  { key: 'blueberry', name: 'Blueberry', moistureMin: 20, moistureMax: 35, phMin: 4.5, phMax: 5.5, ecMax: 1.0, frostRiskC: 0 },
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

let ensured = false;

// Creates any missing default profile, once per process. Locked so concurrent first requests
// do not create duplicates.
export function ensureCropProfiles(): Promise<void> {
  return withLock('crop_profile:defaults', async () => {
    if (ensured) return;
    const { crop_profile } = await db();
    const have = new Set((await listAll(crop_profile, {})).map((r) => str(r.data.key)));
    for (const p of DEFAULT_PROFILES) {
      if (!have.has(p.key)) await crop_profile.create({ title: p.name, data: p });
    }
    ensured = true;
  });
}

export async function listCropProfiles(): Promise<CropProfile[]> {
  await ensureCropProfiles();
  const { crop_profile } = await db();
  return (await listAll(crop_profile, {})).map(toCrop).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCropProfile(id: string): Promise<CropProfile> {
  const { crop_profile } = await db();
  return toCrop(await getOwned(crop_profile, id, null, 'Crop profile'));
}
