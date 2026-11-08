// Shared helpers for owner-scoped records.
import type { EntityClient, EntityRecord } from '@piezas/sdk';
import { errorCode } from '../piezas';
import { notFound } from '../errors';

// Every page, 100 at a time (the API rejects larger pages).
export async function listAll(client: EntityClient, filter: Record<string, unknown>): Promise<EntityRecord[]> {
  const all: EntityRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await client.list({ filter, limit: 100, offset });
    all.push(...page.data);
    if (page.data.length < 100) return all;
  }
}

// The record if it exists, is of this type and belongs to ownerId; otherwise 404.
// ownerId === null means "no owner check" (shared records such as crop profiles).
export async function getOwned(client: EntityClient, id: string, ownerId: string | null, what: string): Promise<EntityRecord> {
  if (typeof id !== 'string' || !id) throw notFound(what);
  let r: EntityRecord;
  try {
    r = await client.get(id);
  } catch (e) {
    if (['not_found', 'validation_failed'].includes(errorCode(e) ?? '')) throw notFound(what);
    throw e;
  }
  if (r.entityTypeId !== client.getEntityTypeId()) throw notFound(what);
  if (ownerId !== null && r.data.ownerId !== ownerId) throw notFound(what);
  return r;
}

export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Piezas stores createdAt to the second (docs/backend-notes.md E19), so records made in the same second tie.
// The id breaks the tie, so a list never reorders between two requests.
export const oldestFirst = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
