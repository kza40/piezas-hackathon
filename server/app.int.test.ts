// HTTP-level checks of /api against the TEST Piezas app: cookies, status codes, isolation.
// Run: npm run test:int
const testKey = process.env.PIEZAS_TEST_API_KEY;
if (!testKey) throw new Error('PIEZAS_TEST_API_KEY missing: run `npx piezas test --setup`');
process.env.PIEZAS_API_KEY = testKey;

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './app';
import { db, piezas } from '../lib/server/piezas';
import { listAll } from '../lib/server/data/records';

const run = Date.now();
const userIds: string[] = [];

// A tiny cookie-keeping client, like a browser tab.
function browser() {
  let cookie = '';
  return async (method: string, path: string, json?: unknown, headers: Record<string, string> = {}) => {
    const res = await api.request(path, {
      method,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const text = await res.text();
    return { status: res.status, setCookie: set, body: text ? JSON.parse(text) : null };
  };
}

const sam = browser();
const jordan = browser();

before(async () => {
  await (piezas().users as any).configurePolicy({ requireEmailVerification: false });
});

after(async () => {
  const { farm, field, profile } = await db();
  for (const ownerId of userIds) {
    for (const client of [field, farm, profile]) for (const r of await listAll(client, { ownerId })) await client.delete(r.id);
    await piezas().users.deleteUser(ownerId).catch(() => {});
  }
});

describe('accounts over HTTP', () => {
  test('sign-up sets an httpOnly session cookie and saves the name', async () => {
    const r = await sam('POST', '/api/auth/sign-up', { email: `sam-${run}@example.test`, password: 'farm-pass-1', name: 'Sam Whitfield' });
    assert.equal(r.status, 201);
    userIds.push(r.body.user.id);
    assert.match(r.setCookie ?? '', /piezas_session=.+; .*HttpOnly/i);
    assert.match(r.setCookie ?? '', /SameSite=Lax/i);
    assert.equal(r.body.profile.name, 'Sam Whitfield');
    assert.equal((await sam('GET', '/api/auth/me')).body.user.id, r.body.user.id);
  });

  test('a bad name is rejected before any account is created', async () => {
    const anon = browser();
    const email = `longname-${run}@example.test`;
    const r = await anon('POST', '/api/auth/sign-up', { email, password: 'long-enough-1', name: 'x'.repeat(81) });
    assert.equal(r.status, 400);
    assert.equal(r.setCookie, null);
    assert.equal((await anon('POST', '/api/auth/sign-in', { email, password: 'long-enough-1' })).status, 401);
  });

  test('the cookie is Secure when the farmer came over https (directly or via the proxy)', async () => {
    const creds = { email: `sam-${run}@example.test`, password: 'farm-pass-1' };
    const viaProxy = await api.request('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify(creds),
    });
    assert.match(viaProxy.headers.get('set-cookie') ?? '', /;\s*Secure/i);
    const direct = await api.request('https://fieldwise.example/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(creds),
    });
    assert.match(direct.headers.get('set-cookie') ?? '', /;\s*Secure/i);
    const local = await api.request('/api/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds) });
    assert.doesNotMatch(local.headers.get('set-cookie') ?? '', /;\s*Secure/i); // plain http on localhost
  });

  test('a second farmer signs up separately', async () => {
    const r = await jordan('POST', '/api/auth/sign-up', { email: `jordan-${run}@example.test`, password: 'oats-pass-1' });
    assert.equal(r.status, 201);
    userIds.push(r.body.user.id);
  });

  test('without a session, protected routes are 401 with a readable message', async () => {
    const anon = browser();
    const r = await anon('GET', '/api/farms');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'unauthorized');
    assert.ok(r.body.message);
  });

  test('wrong password is 401 and sets no cookie', async () => {
    const anon = browser();
    const r = await anon('POST', '/api/auth/sign-in', { email: `sam-${run}@example.test`, password: 'nope-nope-nope' });
    assert.equal(r.status, 401);
    assert.equal(r.setCookie, null);
  });

  test('profile updates are partial and validated', async () => {
    assert.equal((await sam('PATCH', '/api/me/profile', { phone: '(519) 555-0142' })).body.profile.name, 'Sam Whitfield');
    assert.equal((await sam('PATCH', '/api/me/profile', { phone: 'call me' })).status, 400);
    assert.equal((await sam('GET', '/api/auth/me')).body.profile.phone, '(519) 555-0142');
  });
});

describe('farms and fields over HTTP', () => {
  let farmId = '';
  let fieldId = '';

  test('the six crops are offered, blueberries with acidic pH', async () => {
    const crops = (await sam('GET', '/api/crop-profiles')).body.cropProfiles;
    assert.deepEqual(
      crops.map((c: any) => c.name),
      ['Wheat', 'Canola', 'Barley', 'Oats', 'Alfalfa', 'Blueberries'],
    );
    const blue = crops.find((c: any) => c.key === 'blueberry');
    assert.equal(blue.phMax, 5.5);
  });

  test('create a farm and a field with acres, stage and soil', async () => {
    const farm = await sam('POST', '/api/farms', { name: 'Willow Creek Farm', latitude: 43.7, longitude: -80.37 });
    assert.equal(farm.status, 201);
    farmId = farm.body.farm.id;
    const crops = (await sam('GET', '/api/crop-profiles')).body.cropProfiles;
    const blue = crops.find((c: any) => c.key === 'blueberry');
    const field = await sam('POST', `/api/farms/${farmId}/fields`, { name: 'Blueberry Hill', cropProfileId: blue.id, acres: 22, stage: 'Fruit set', soil: 'Sandy loam' });
    assert.equal(field.status, 201);
    fieldId = field.body.field.id;
    assert.equal(field.body.field.acres, 22);
    assert.equal(field.body.field.cropProfile.name, 'Blueberries');
    assert.equal((await sam('GET', `/api/farms/${farmId}/fields`)).body.fields.length, 1);
  });

  test("another farmer gets 404 for Sam's farm and field, and cannot delete it", async () => {
    assert.equal((await jordan('GET', `/api/farms/${farmId}`)).status, 404);
    assert.equal((await jordan('GET', `/api/fields/${fieldId}`)).status, 404);
    assert.equal((await jordan('DELETE', `/api/fields/${fieldId}`)).status, 404);
    assert.deepEqual((await jordan('GET', '/api/farms')).body.farms, []);
  });

  test('Sam removes the field', async () => {
    assert.equal((await sam('DELETE', `/api/fields/${fieldId}`)).status, 204);
    assert.equal((await sam('GET', `/api/fields/${fieldId}`)).status, 404);
    assert.deepEqual((await sam('GET', `/api/farms/${farmId}/fields`)).body.fields, []);
  });
});

describe('request hygiene', () => {
  test('invalid JSON is a 400, unknown /api paths are a JSON 404', async () => {
    const res = await api.request('/api/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(res.status, 400);
    const missing = await sam('GET', '/api/nope');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'not_found');
  });

  test('another site cannot sign anyone in: only application/json bodies are accepted', async () => {
    // These are the content types a cross-site page may send without a CORS preflight.
    const attempts: [string, string][] = [
      ['application/x-www-form-urlencoded', `email=sam-${run}%40example.test&password=farm-pass-1`],
      ['text/plain', JSON.stringify({ email: `sam-${run}@example.test`, password: 'farm-pass-1' })],
      ['multipart/form-data; boundary=x', '--x--'],
    ];
    for (const [type, payload] of attempts) {
      const res = await api.request('/api/auth/sign-in', { method: 'POST', headers: { 'content-type': type, origin: 'https://evil.example' }, body: payload });
      assert.equal(res.status, 415, type);
      assert.equal(res.headers.get('set-cookie'), null, type);
    }
    const noType = await api.request('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', password: 'x' }) });
    assert.equal(noType.status, 415);
    const withCharset = await api.request('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ email: `sam-${run}@example.test`, password: 'farm-pass-1' }),
    });
    assert.equal(withCharset.status, 200);
  });

  test('sign-out clears the cookie and ends the session', async () => {
    const r = await sam('POST', '/api/auth/sign-out');
    assert.equal(r.status, 204);
    assert.equal((await sam('GET', '/api/auth/me')).status, 401);
  });
});
