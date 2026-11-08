// Against the TEST copy of the Piezas app (never the live one). Run: npm run test:int
// Covers the backend side of SPEC S-001 (sign-up), S-002 (farm + blueberry field) and S-011 (isolation).
const testKey = process.env.PIEZAS_TEST_API_KEY;
if (!testKey) throw new Error('PIEZAS_TEST_API_KEY missing: run `npx piezas test --setup`');
process.env.PIEZAS_API_KEY = testKey; // before anything creates the client

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors';
import { db, piezas } from './piezas';
import { getSessionUser, requireUser, signIn, signOut, signUp } from './auth';
import { ensureCropProfiles, listCropProfiles } from './data/crops';
import { createFarm, createField, deleteField, getFarm, getField, listFarms, listFields } from './data/farms';
import { getProfile, updateProfile } from './data/profile';
import { listAll } from './data/records';

const run = Date.now();
// Data tests use made-up owner ids; ownership is only ever data.ownerId, so no real user is needed.
const alice = `test-alice-${run}`;
const bob = `test-bob-${run}`;
const users: string[] = [];

const statusOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof AppError ? e.status : `unexpected: ${String(e)}`;
  }
};

after(async () => {
  const { farm, field, profile } = await db();
  for (const ownerId of [alice, bob]) {
    for (const r of await listAll(profile, { ownerId })) await profile.delete(r.id);
    for (const r of await listAll(field, { ownerId })) await field.delete(r.id);
    for (const r of await listAll(farm, { ownerId })) await farm.delete(r.id);
  }
  for (const id of users) await piezas().users.deleteUser(id).catch(() => {});
});

describe('auth', () => {
  const email = `farmer-${run}@example.test`;
  const password = `Pw-${run}-long`;

  test('sign-up signs the farmer in and the session resolves to them', async () => {
    await (piezas().users as any).configurePolicy({ requireEmailVerification: false });
    const s = await signUp(email, password);
    users.push(s.user.id);
    assert.equal(s.user.email, email);
    assert.ok(s.token);
    assert.equal((await requireUser(s.token)).id, s.user.id);
  });

  test('signing up again with a different password is a 409 and does not change the account', async () => {
    assert.equal(await statusOf(signUp(email, 'another-password-1')), 409);
    assert.equal(await statusOf(signIn(email, 'another-password-1')), 401);
    assert.equal(await statusOf(signIn(email, password)), 'resolved');
  });

  test('signing up again with the same password just signs the farmer in to the same account', async () => {
    const s = await signUp(email, password);
    assert.equal(s.user.id, users[0]);
  });

  test('wrong password is a 401 with no hint about which part was wrong', async () => {
    assert.equal(await statusOf(signIn(email, 'wrong-password')), 401);
    assert.equal(await statusOf(signIn(`nobody-${run}@example.test`, 'whatever1')), 401);
  });

  test('sign-out ends the session', async () => {
    const s = await signIn(email, password);
    await signOut(s.token);
    assert.equal(await getSessionUser(s.token), null);
  });

  test('missing or garbage tokens are signed out, not errors', async () => {
    assert.equal(await getSessionUser(undefined), null);
    assert.equal(await getSessionUser('not-a-real-token'), null);
    assert.equal(await statusOf(requireUser('not-a-real-token')), 401);
  });
});

describe('crop profiles', () => {
  test('all six default crops exist exactly once, even when first requests race', async () => {
    await Promise.all([ensureCropProfiles(), ensureCropProfiles(), ensureCropProfiles()]);
    const crops = await listCropProfiles();
    assert.deepEqual(crops.map((c) => c.key), ['wheat', 'canola', 'barley', 'oats', 'alfalfa', 'blueberry']);
    const blueberries = crops.filter((c) => c.key === 'blueberry');
    assert.equal(blueberries.length, 1);
    assert.equal(blueberries[0].phMin, 4.5);
    assert.equal(blueberries[0].phMax, 5.2);
  });
});

describe('farms and fields', () => {
  test('a farmer creates a farm and a blueberry field and sees the crop ranges (S-002)', async () => {
    const blueberry = (await listCropProfiles()).find((c) => c.key === 'blueberry')!;
    const farm = await createFarm(alice, { name: 'Fraser Ridge', latitude: 49.05, longitude: -122.3 });
    const field = await createField(alice, farm.id, { name: 'North block', cropProfileId: blueberry.id });
    assert.equal(field.farmId, farm.id);
    assert.equal(field.cropProfile?.moistureMin, null);
    assert.equal(field.cropProfile?.phMin, 4.5);
    assert.equal(field.cropProfile?.phMax, 5.2);
    assert.deepEqual(
      (await listFields(alice, farm.id)).map((f) => f.name),
      ['North block'],
    );
    assert.equal((await getField(alice, field.id)).cropProfile?.key, 'blueberry');
  });

  test('a new farmer has no farms (S-001 dashboard)', async () => {
    assert.deepEqual(await listFarms(`test-new-${run}`), []);
  });

  test('farmers only ever see their own farms and fields (S-011)', async () => {
    const blueberry = (await listCropProfiles()).find((c) => c.key === 'blueberry')!;
    const bobFarm = await createFarm(bob, { name: 'Bob Farm', latitude: 49.2, longitude: -122.7 });
    const bobField = await createField(bob, bobFarm.id, { name: 'Bob field', cropProfileId: blueberry.id });

    const aliceFarms = await listFarms(alice);
    assert.ok(aliceFarms.length >= 1);
    assert.ok(aliceFarms.every((f) => f.name !== 'Bob Farm'));

    // Reading, listing under, or adding to someone else's farm all look like "not found".
    assert.equal(await statusOf(getFarm(alice, bobFarm.id)), 404);
    assert.equal(await statusOf(listFields(alice, bobFarm.id)), 404);
    assert.equal(await statusOf(getField(alice, bobField.id)), 404);
    assert.equal(await statusOf(createField(alice, bobFarm.id, { name: 'sneaky', cropProfileId: blueberry.id })), 404);
  });

  test('ids of other record types or nonsense ids are 404, not 500', async () => {
    const blueberry = (await listCropProfiles()).find((c) => c.key === 'blueberry')!;
    assert.equal(await statusOf(getFarm(alice, blueberry.id)), 404); // a crop profile id is not a farm
    assert.equal(await statusOf(getFarm(alice, 'does-not-exist')), 404);
  });

  test('bad input is a 400 and an unknown crop is rejected', async () => {
    assert.equal(await statusOf(createFarm(alice, { name: '', latitude: 1, longitude: 1 })), 400);
    const farm = await createFarm(alice, { name: 'Second', latitude: 49, longitude: -122 });
    assert.equal(await statusOf(createField(alice, farm.id, { name: 'X', cropProfileId: farm.id })), 400);
  });

  test('only the owner can delete a field', async () => {
    const blueberry = (await listCropProfiles()).find((c) => c.key === 'blueberry')!;
    const farm = await createFarm(alice, { name: 'Third', latitude: 49, longitude: -122 });
    const field = await createField(alice, farm.id, { name: 'Doomed', cropProfileId: blueberry.id, acres: '12' });
    assert.equal(field.acres, 12);
    assert.equal(await statusOf(deleteField(bob, field.id)), 404);
    await deleteField(alice, field.id);
    assert.equal(await statusOf(getField(alice, field.id)), 404);
  });
});

describe('profile', () => {
  test('starts empty, saves partially, and a double save keeps one record', async () => {
    assert.deepEqual(await getProfile(alice), { name: '', phone: '' });
    await Promise.all([updateProfile(alice, { name: 'Alice' }), updateProfile(alice, { phone: '604 555 0100' })]);
    assert.deepEqual(await getProfile(alice), { name: 'Alice', phone: '604 555 0100' });
    const { profile } = await db();
    assert.equal((await listAll(profile, { ownerId: alice })).length, 1);
  });
});
