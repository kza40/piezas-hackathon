import type { FieldId } from '../types';

/** Demo farmers. Passwords are mock-only for this UI; Piezas users replaces this later. */
export interface Farmer {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  farm: string;
  location: string;
  phone: string;
  since: number;
  fields: FieldId[];
  alerts: string;
}

const OWNED_KEY = 'fw-owned';

const BASE_FIELDS: Record<string, FieldId[]> = {
  sam: ['A', 'B', 'C'],
  jordan: ['D', 'E', 'F'],
};

export const FARMERS: Farmer[] = [
  {
    id: 'sam',
    email: 'sam@willowcreekfarm.ca',
    password: 'farm123',
    name: 'Sam Whitfield',
    role: 'Owner',
    farm: 'Willow Creek Farm',
    location: 'Wellington County, ON',
    phone: '(519) 555-0142',
    since: 2011,
    fields: [...BASE_FIELDS.sam],
    alerts: 'Text + email for critical alerts',
  },
  {
    id: 'jordan',
    email: 'jordan@mapleridge.ca',
    password: 'oats456',
    name: 'Jordan Hale',
    role: 'Owner',
    farm: 'Maple Ridge Farm',
    location: 'Perth County, ON',
    phone: '(519) 555-0198',
    since: 2016,
    fields: [...BASE_FIELDS.jordan],
    alerts: 'Email for critical alerts',
  },
];

export const farmerById = (id: string | null | undefined) => FARMERS.find((f) => f.id === id) ?? null;
export const farmerByEmail = (email: string) => FARMERS.find((f) => f.email.toLowerCase() === email.trim().toLowerCase()) ?? null;

function readOwned(): Record<string, FieldId[]> {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FieldId[]>) : {};
  } catch {
    return {};
  }
}

export function loadOwnedFields() {
  const owned = readOwned();
  for (const farmer of FARMERS) {
    const extra = owned[farmer.id];
    farmer.fields = [...(BASE_FIELDS[farmer.id] ?? []), ...(extra ?? []).filter((id) => !(BASE_FIELDS[farmer.id] ?? []).includes(id))];
  }
}

function saveOwnedExtras(farmerId: string, fields: FieldId[]) {
  const owned = readOwned();
  const base = BASE_FIELDS[farmerId] ?? [];
  owned[farmerId] = fields.filter((id) => !base.includes(id));
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify(owned));
  } catch {
    // demo keeps the change for this session only
  }
}

export function grantField(farmerId: string, fieldId: FieldId) {
  const farmer = farmerById(farmerId);
  if (!farmer || farmer.fields.includes(fieldId)) return;
  farmer.fields.push(fieldId);
  saveOwnedExtras(farmerId, farmer.fields);
}

export function revokeField(farmerId: string, fieldId: FieldId) {
  const farmer = farmerById(farmerId);
  if (!farmer) return;
  farmer.fields = farmer.fields.filter((id) => id !== fieldId);
  saveOwnedExtras(farmerId, farmer.fields);
}

export const isSeedField = (fieldId: FieldId) => Object.values(BASE_FIELDS).some((ids) => ids.includes(fieldId));
