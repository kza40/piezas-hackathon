// Every Piezas record type the app uses. Shared by the app and scripts/seed.ts.
//
// Piezas never changes a schema once it is stored (defineEntities only reports drift),
// so think before editing a field here: a change needs an explicit schema update.
// `required` is kept to ownership and true parent keys; everything else is checked in our code.
import type { EntityDefinition } from '@piezas/sdk';

export const ENTITIES = {
  crop_profile: {
    fields: {
      key: { type: 'text', required: true }, // stable id, e.g. "blueberry"
      name: { type: 'text' },
      moistureMin: { type: 'number' },
      moistureMax: { type: 'number' },
      phMin: { type: 'number' },
      phMax: { type: 'number' },
      ecMax: { type: 'number' },
      frostRiskC: { type: 'number' },
    },
  },
  farm: {
    fields: {
      ownerId: { type: 'text', required: true },
      name: { type: 'text' },
      latitude: { type: 'number' },
      longitude: { type: 'number' },
    },
  },
  field: {
    fields: {
      ownerId: { type: 'text', required: true },
      farmId: { type: 'text', required: true },
      name: { type: 'text' },
      cropProfileId: { type: 'text' },
    },
  },
  sensor: {
    fields: {
      ownerId: { type: 'text', required: true },
      fieldId: { type: 'text', required: true },
      name: { type: 'text' },
      keyHash: { type: 'text' },
      keyStatus: { type: 'text' }, // active | revoked (text, not select: a select's options can never change)
    },
  },
  reading_day: {
    // one record per sensor + reading type + day; `values` ([{ t, v }]) is stored as undeclared JSON
    fields: {
      ownerId: { type: 'text', required: true },
      sensorId: { type: 'text', required: true },
      readingType: { type: 'text' },
      day: { type: 'text' },
    },
  },
  alert: {
    fields: {
      ownerId: { type: 'text', required: true },
      fieldId: { type: 'text', required: true },
      message: { type: 'text' },
      status: { type: 'text' }, // open | done
    },
  },
} satisfies Record<string, EntityDefinition>;

export type EntityName = keyof typeof ENTITIES;
