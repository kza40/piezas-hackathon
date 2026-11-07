// Server-only Piezas access. Never import this from browser code: it holds PIEZAS_API_KEY.
import { Piezas, type EntityClient } from '@piezas/sdk';
import { ENTITIES, type EntityName } from './schema';

let client: Piezas | undefined;

export function piezas(): Piezas {
  if (!client) {
    const apiKey = process.env.PIEZAS_API_KEY;
    if (!apiKey) throw new Error('PIEZAS_API_KEY is not set');
    client = new Piezas({ apiKey, apiBaseUrl: process.env.PIEZAS_API_URL });
  }
  return client;
}

let entities: Promise<Record<EntityName, EntityClient>> | undefined;

// The record clients, defined once per process. Use these, not piezas().<plural>:
// the SDK's plural accessor names are unreliable (see docs/backend-notes.md, E1).
export function db(): Promise<Record<EntityName, EntityClient>> {
  entities ??= piezas()
    .defineEntities(ENTITIES)
    .catch((e) => {
      entities = undefined; // let the next request retry instead of caching the failure
      throw e;
    });
  return entities;
}

export function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}
