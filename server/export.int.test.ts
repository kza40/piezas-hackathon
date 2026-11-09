// HTTP check: signed-in farmer can download last-14-days CSV for a field.
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
function sessionClient() {
  let cookie = '';
  return {
    async json(method: string, path: string, body?: unknown) {
      const res = await api.request(path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, cookie };
    },
    async raw(method: string, path: string) {
      const res = await api.request(path, {
        method,
        headers: cookie ? { cookie } : {},
      });
      return {
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        disposition: res.headers.get('content-disposition') ?? '',
        text: await res.text(),
      };
    },
  };
}
const farmer = sessionClient();
before(async () => {
  await (piezas().users as any).configurePolicy({ requireEmailVerification: false });
});
after(async () => {
  const { farm, field, profile, sensor, reading_day, alert } = await db();
  for (const ownerId of userIds) {
    for (const client of [alert, reading_day, sensor, field, farm, profile]) {
      for (const r of await listAll(client, { ownerId })) await client.delete(r.id);
    }
    await piezas().users.deleteUser(ownerId).catch(() => {});
  }
});
describe('field CSV export over HTTP', () => {
  let fieldId = '';
  test('setup: farm, field, sensor, simulate', async () => {
    const signed = await farmer.json('POST', '/api/auth/sign-up', {
      email: `export-${run}@example.test`,
      password: 'export-pass-1',
      name: 'Export Tester',
    });
    assert.equal(signed.status, 201);
    userIds.push(signed.body.user.id);
    const crops = await farmer.json('GET', '/api/crop-profiles');
    const wheat = crops.body.cropProfiles.find((c: { name: string }) => c.name === 'Wheat');
    assert.ok(wheat);
    const farm = await farmer.json('POST', '/api/farms', {
      name: 'Export Farm',
      latitude: 43.55,
      longitude: -80.25,
    });
    assert.equal(farm.status, 201);
    const field = await farmer.json('POST', `/api/farms/${farm.body.farm.id}/fields`, {
      name: 'North Wheat',
      cropProfileId: wheat.id,
      acres: 40,
    });
    assert.equal(field.status, 201);
    fieldId = field.body.field.id;
    const sensor = await farmer.json('POST', `/api/fields/${fieldId}/sensors`, { name: 'North probe' });
    assert.equal(sensor.status, 201);
    const sim = await farmer.json('POST', `/api/fields/${fieldId}/simulate`);
    assert.equal(sim.status, 200);
  });
  test('GET /api/fields/:id/export returns 14-day CSV attachment', async () => {
    const r = await farmer.raw('GET', `/api/fields/${fieldId}/export`);
    assert.equal(r.status, 200);
    assert.match(r.contentType, /text\/csv/);
    assert.match(r.disposition, /attachment; filename="north-wheat-export\.csv"/);
    assert.match(r.text, /^exportedAt,rangeDays,farm,field,crop,sensor,type,value,unit,time,adviceLabel,adviceReason,rainNext48hMm,overnightLowC\n/);
    assert.match(r.text, /,14,Export Farm,North Wheat,Wheat,/);
    assert.ok(r.text.trim().split('\n').length > 100, 'expected many reading rows after simulate');
  });
  test('without a session, export is 401', async () => {
    const res = await api.request(`/api/fields/${fieldId}/export`);
    assert.equal(res.status, 401);
  });
});
