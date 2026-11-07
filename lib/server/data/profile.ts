// The farmer's name and phone. One record per farmer, created on first save.
import { db } from '../piezas';
import { withLock } from '../lock';
import { object, optional, text } from '../validate';
import { badRequest } from '../errors';
import { listAll, str } from './records';

export interface Profile {
  name: string;
  phone: string;
}

export function parseProfileInput(body: unknown): Partial<Profile> {
  const b = object(body);
  const phone = optional(b.phone, (v) => text('Phone', v, { max: 30 }));
  if (phone !== undefined && !/^[0-9+()\-.\s]{7,30}$/.test(phone)) throw badRequest('Enter a valid phone number.');
  return {
    ...(b.name !== undefined ? { name: text('Name', b.name, { max: 80 }) } : {}),
    ...(b.phone !== undefined ? { phone: phone ?? '' } : {}),
  };
}

async function find(ownerId: string) {
  const { profile } = await db();
  return (await listAll(profile, { ownerId }))[0];
}

export async function getProfile(ownerId: string): Promise<Profile> {
  const r = await find(ownerId);
  return { name: str(r?.data.name), phone: str(r?.data.phone) };
}

// Partial update: only the keys sent are changed. Locked so a double submit cannot create two records.
export function updateProfile(ownerId: string, body: unknown): Promise<Profile> {
  const changes = parseProfileInput(body);
  return withLock(`profile:${ownerId}`, async () => {
    const { profile } = await db();
    const r = await find(ownerId);
    if (r) await profile.update(r.id, { data: changes });
    else await profile.create({ title: ownerId, data: { ownerId, ...changes } });
    return getProfile(ownerId);
  });
}
