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
import { openAlert } from '../lib/server/data/alerts';

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
  const { farm, field, profile, sensor, reading_day, alert } = await db();
  for (const ownerId of userIds) {
    for (const client of [alert, reading_day, sensor, field, farm, profile]) for (const r of await listAll(client, { ownerId })) await client.delete(r.id);
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

describe('sensors, device keys and ingest over HTTP', () => {
  let fieldId = '';
  let sensorId = '';
  let deviceKey = '';
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const device = async (key: string | undefined, json: unknown) => {
    const res = await api.request('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key !== undefined ? { 'x-device-key': key } : {}) },
      body: JSON.stringify(json),
    });
    return { status: res.status, body: await res.json() };
  };
  const latest = async () => (await sam('GET', `/api/fields/${fieldId}/sensors`)).body.sensors.find((s: any) => s.id === sensorId).latest;

  test('S-003: registering a sensor shows its device key once and lists it as active', async () => {
    const farm = (await sam('POST', '/api/farms', { name: 'Sensor Farm', latitude: 49.05, longitude: -122.3 })).body.farm;
    const crop = (await sam('GET', '/api/crop-profiles')).body.cropProfiles[5];
    fieldId = (await sam('POST', `/api/farms/${farm.id}/fields`, { name: 'North block', cropProfileId: crop.id })).body.field.id;

    const r = await sam('POST', `/api/fields/${fieldId}/sensors`, { name: 'Row 3 probe' });
    assert.equal(r.status, 201);
    assert.match(r.body.deviceKey, /^fwk_[A-Za-z0-9_-]{43}$/);
    assert.deepEqual({ ...r.body.sensor, id: '', createdAt: '' }, { id: '', fieldId, name: 'Row 3 probe', keyStatus: 'active', latest: {}, createdAt: '' });
    ({ deviceKey } = r.body);
    sensorId = r.body.sensor.id;

    const listed = await sam('GET', `/api/fields/${fieldId}/sensors`);
    assert.deepEqual(listed.body.sensors.map((s: any) => [s.name, s.keyStatus]), [['Row 3 probe', 'active']]);
    assert.ok(!JSON.stringify(listed.body).includes(deviceKey.slice(4)), 'the key is never shown again');
    assert.ok(!JSON.stringify(listed.body).includes('keyHash'), 'nor its hash');
  });

  test("S-011: another farmer cannot see, add to or revoke Sam's sensors", async () => {
    assert.equal((await jordan('GET', `/api/fields/${fieldId}/sensors`)).status, 404);
    assert.equal((await jordan('POST', `/api/fields/${fieldId}/sensors`, { name: 'Sneaky' })).status, 404);
    assert.equal((await jordan('POST', `/api/sensors/${sensorId}/revoke`)).status, 404);
    assert.equal((await sam('POST', `/api/sensors/${fieldId}/revoke`)).status, 404); // a field id is not a sensor id
  });

  test('S-004: a reading with the key is saved; a wrong, missing or malformed key is rejected', async () => {
    const reading = { type: 'soil_moisture', value: 27.4, unit: '%', time: at(60) };
    const good = await device(deviceKey, reading);
    assert.deepEqual([good.status, good.body], [202, { accepted: 1 }]);
    assert.deepEqual((await latest()).soil_moisture, { value: 27.4, unit: '%', time: reading.time });

    const forged = `fwk_${'A'.repeat(43)}`;
    for (const key of [forged, undefined, 'not-a-key', deviceKey.slice(0, -1)]) {
      const bad = await device(key, { ...reading, value: 99 });
      assert.equal(bad.status, 401, String(key));
      assert.equal(bad.body.error, 'unauthorized');
    }
    assert.equal((await latest()).soil_moisture.value, 27.4);
  });

  test('an oversized ingest body is refused before it is read', async () => {
    const huge = { readings: [], padding: 'x'.repeat(70 * 1024) };
    const r = await device(deviceKey, huge);
    assert.deepEqual([r.status, r.body.error], [413, 'payload_too_large']);
  });

  test('S-012: all six types are saved in one batch; an unsupported type or wrong unit is rejected', async () => {
    const t = at(30);
    const six = [
      { type: 'soil_moisture', value: 31.2, unit: '%' },
      { type: 'soil_temperature', value: 8.5, unit: 'C' },
      { type: 'soil_ec', value: 0.6, unit: 'dS/m' },
      { type: 'soil_ph', value: 5.1, unit: 'pH' },
      { type: 'air_temperature', value: 6.2, unit: 'C' },
      { type: 'air_humidity', value: 88, unit: '%' },
    ].map((r) => ({ ...r, time: t }));
    assert.deepEqual((await device(deviceKey, { readings: six })).body, { accepted: 6 });
    const l = await latest();
    assert.deepEqual(Object.keys(l).sort(), six.map((r) => r.type).sort());
    assert.deepEqual(l.soil_ec, { value: 0.6, unit: 'dS/m', time: t });

    const light = await device(deviceKey, { type: 'light', value: 300, unit: 'lux', time: at(10) });
    assert.equal(light.status, 400);
    assert.match(light.body.message, /type must be one of/);
    // All or nothing: a good reading next to a bad one is not saved either.
    const mixed = await device(deviceKey, { readings: [{ ...six[0], value: 44, time: at(5) }, { ...six[1], unit: 'F', time: at(5) }] });
    assert.equal(mixed.status, 400);
    assert.equal((await latest()).soil_moisture.value, 31.2);
  });

  test('a late, older reading does not replace a newer one', async () => {
    assert.equal((await device(deviceKey, { type: 'soil_ph', value: 6.9, unit: 'pH', time: at(600) })).status, 202);
    assert.equal((await latest()).soil_ph.value, 5.1);
  });

  test('parallel batches from one device are all kept (the per-sensor lock)', async () => {
    const t = at(1);
    const types = [
      ['soil_moisture', '%'],
      ['soil_temperature', 'C'],
      ['air_temperature', 'C'],
      ['air_humidity', '%'],
    ];
    const res = await Promise.all(types.map(([type, unit], i) => device(deviceKey, { type, unit, value: 20 + i, time: t })));
    assert.deepEqual(res.map((r) => r.status), [202, 202, 202, 202]);
    const l = await latest();
    assert.deepEqual(types.map(([type]) => l[type].value), [20, 21, 22, 23]);
  });

  test('S-005: after the farmer revokes the key, readings are rejected', async () => {
    // A batch arriving at the same moment must not undo the revoke (revoke writes only keyStatus).
    const [r] = await Promise.all([
      sam('POST', `/api/sensors/${sensorId}/revoke`),
      device(deviceKey, { type: 'air_humidity', value: 55, unit: '%', time: at(0) }),
    ]);
    assert.equal(r.status, 200);
    assert.equal(r.body.sensor.keyStatus, 'revoked');
    const listed = (await sam('GET', `/api/fields/${fieldId}/sensors`)).body.sensors.find((s: any) => s.id === sensorId);
    assert.equal(listed.keyStatus, 'revoked');
    const after = await device(deviceKey, { type: 'soil_moisture', value: 30, unit: '%', time: at(0) });
    assert.equal(after.status, 401);
    assert.match(after.body.message, /revoked/);
    assert.equal((await latest()).soil_moisture.value, 20);
  });

  test('removing a field removes its sensors, and their keys stop working', async () => {
    const r = await sam('POST', `/api/fields/${fieldId}/sensors`, { name: 'Second probe' });
    await sam('DELETE', `/api/fields/${fieldId}`);
    const { sensor } = await db();
    assert.deepEqual(await listAll(sensor, { fieldId }), []);
    assert.equal((await device(r.body.deviceKey, { type: 'soil_moisture', value: 30, unit: '%', time: at(0) })).status, 401);
  });
});

describe('reading history and the simulator over HTTP', () => {
  let fieldId = '';
  const sensors: { id: string; key: string }[] = [];
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const device = (key: string, json: unknown) =>
    api.request('/api/ingest', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-key': key }, body: JSON.stringify(json) });
  const readings = async (q = '') => (await sam('GET', `/api/fields/${fieldId}/readings${q}`)).body;
  const historyRecords = async (sensorId: string) => listAll((await db()).reading_day, { sensorId });

  test('setup: a blueberry field with two sensors', async () => {
    const farm = (await sam('POST', '/api/farms', { name: 'History Farm', latitude: 49.05, longitude: -122.3 })).body.farm;
    const crop = (await sam('GET', '/api/crop-profiles')).body.cropProfiles.find((c: any) => c.key === 'blueberry');
    fieldId = (await sam('POST', `/api/farms/${farm.id}/fields`, { name: 'East block', cropProfileId: crop.id })).body.field.id;
    const none = await sam('POST', `/api/fields/${fieldId}/simulate`);
    assert.deepEqual([none.status, none.body.message], [400, 'Register a sensor on this field first.']);
    for (const name of ['Row 1 probe', 'Row 9 probe']) {
      const r = (await sam('POST', `/api/fields/${fieldId}/sensors`, { name })).body;
      sensors.push({ id: r.sensor.id, key: r.deviceKey });
    }
  });

  test('ingest keeps history; a resent reading replaces itself instead of duplicating', async () => {
    const t1 = at(120);
    const t2 = at(60);
    await device(sensors[0].key, { readings: [{ type: 'soil_moisture', value: 33, unit: '%', time: t1 }, { type: 'soil_moisture', value: 32, unit: '%', time: t2 }] });
    await device(sensors[0].key, { type: 'soil_moisture', value: 31.5, unit: '%', time: t2 }); // resent with a corrected value
    const body = await readings('?days=1');
    assert.equal(body.days, 1);
    const s0 = body.sensors.find((s: any) => s.sensorId === sensors[0].id);
    assert.deepEqual(s0.series.soil_moisture, [
      { time: t1, value: 33 },
      { time: t2, value: 31.5 },
    ]);
    assert.equal(s0.simulated, false);
    assert.equal(body.sensors.find((s: any) => s.sensorId === sensors[1].id).series.soil_moisture, undefined);
  });

  test('parallel batches from one device keep every history point (the day record is read-modify-write)', async () => {
    const times = [50, 40, 30, 20, 10].map(at);
    const res = await Promise.all(times.map((time, i) => device(sensors[1].key, { type: 'soil_ph', value: 5 + i / 10, unit: 'pH', time })));
    assert.deepEqual(res.map((r) => r.status), [202, 202, 202, 202, 202]);
    const s1 = (await readings('?days=1')).sensors.find((s: any) => s.sensorId === sensors[1].id);
    assert.deepEqual(s1.series.soil_ph.map((p: any) => p.time), [...times].sort());
  });

  test('days must be a whole number from 1 to 14; another farmer gets 404', async () => {
    for (const q of ['?days=0', '?days=15', '?days=abc', '?days=2.5']) assert.equal((await sam('GET', `/api/fields/${fieldId}/readings${q}`)).status, 400, q);
    assert.equal((await jordan('GET', `/api/fields/${fieldId}/readings`)).status, 404);
    assert.equal((await jordan('POST', `/api/fields/${fieldId}/simulate`)).status, 404);
  });

  test('S-006: the simulator fills each sensor with every type, with its own 7-day trend', async () => {
    const r = await sam('POST', `/api/fields/${fieldId}/simulate`);
    assert.equal(r.status, 200);
    const types = ['air_humidity', 'air_temperature', 'soil_ec', 'soil_moisture', 'soil_ph', 'soil_temperature'];
    for (const s of r.body.sensors) assert.deepEqual(Object.keys(s.latest).sort(), types);

    const body = await readings(); // default 7 days
    assert.equal(body.days, 7);
    for (const s of body.sensors) {
      assert.equal(s.simulated, true);
      assert.deepEqual(Object.keys(s.series).sort(), types);
      const m = s.series.soil_moisture;
      assert.ok(m.length >= 7 * 24 - 1 && m.length <= 7 * 24 + 1, `about a week of hourly points, got ${m.length}`);
      const latest = r.body.sensors.find((x: any) => x.id === s.sensorId).latest.soil_moisture;
      assert.deepEqual(m.at(-1), { time: latest.time, value: latest.value });
    }
    const [a, b] = body.sensors.map((s: any) => s.series.soil_moisture.map((p: any) => p.value).join());
    assert.notEqual(a, b, 'two sensors in one field read a little differently');
  });

  test('running the simulator again replaces the history instead of adding to it', async () => {
    const before = (await historyRecords(sensors[0].id)).length;
    assert.ok(before >= 14 * 6 && before <= 15 * 6, `14 days x 6 types, got ${before}`);
    assert.equal((await sam('POST', `/api/fields/${fieldId}/simulate`)).status, 200);
    assert.equal((await historyRecords(sensors[0].id)).length, before);
  });

  test('a new day drops history older than 14 days', async () => {
    const fresh = (await sam('POST', `/api/fields/${fieldId}/sensors`, { name: 'New probe' })).body;
    const { reading_day } = await db();
    const owner = (await sam('GET', '/api/auth/me')).body.user.id;
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    await reading_day.create({
      title: 'old',
      data: { ownerId: owner, sensorId: fresh.sensor.id, readingType: 'soil_ph', day: old.slice(0, 10), values: [{ t: old, v: 5, src: 'real' }] },
    });
    assert.equal((await device(fresh.deviceKey, { type: 'soil_ph', value: 5.2, unit: 'pH', time: at(1) })).status, 202);
    assert.deepEqual((await historyRecords(fresh.sensor.id)).map((r) => r.data.day), [at(1).slice(0, 10)]);
  });

  test('removing the field removes its sensors and their history', async () => {
    await sam('DELETE', `/api/fields/${fieldId}`);
    for (const s of sensors) assert.deepEqual(await historyRecords(s.id), []);
  });
});

describe('alerts over HTTP', () => {
  let samId = '';
  let fieldId = '';
  let alertId = '';
  const message = 'Water North block today: the driest probe reads 31%.';
  const openAlerts = async () => listAll((await db()).alert, { fieldId, status: 'open' });

  test('setup: a field for Sam', async () => {
    samId = (await sam('GET', '/api/auth/me')).body.user.id;
    const farm = (await sam('POST', '/api/farms', { name: 'Alert Farm', latitude: 49.05, longitude: -122.3 })).body.farm;
    const crop = (await sam('GET', '/api/crop-profiles')).body.cropProfiles[5];
    fieldId = (await sam('POST', `/api/farms/${farm.id}/fields`, { name: 'North block', cropProfileId: crop.id })).body.field.id;
  });

  test('S-018: repeated and parallel visits leave exactly one open alert', async () => {
    const first = await openAlert(samId, fieldId, message);
    assert.ok(first);
    alertId = first.id;
    assert.equal((await openAlert(samId, fieldId, message))?.id, alertId);
    const parallel = await Promise.all(Array.from({ length: 5 }, () => openAlert(samId, fieldId, message)));
    assert.deepEqual([...new Set(parallel.map((a) => a?.id))], [alertId]);
    assert.equal((await openAlerts()).length, 1);
  });

  test('the farmer lists their alerts; another farmer sees none and cannot mark them', async () => {
    const r = await sam('GET', '/api/alerts?status=open');
    assert.deepEqual(r.body.alerts.map((a: any) => [a.id, a.fieldId, a.message, a.status, a.doneAt]), [[alertId, fieldId, message, 'open', null]]);
    assert.deepEqual((await jordan('GET', '/api/alerts')).body.alerts, []);
    assert.equal((await jordan('POST', `/api/alerts/${alertId}/done`)).status, 404);
    assert.equal((await sam('GET', '/api/alerts?status=closed')).status, 400);
    const jordanId = (await jordan('GET', '/api/auth/me')).body.user.id;
    await assert.rejects(openAlert(jordanId, fieldId, 'sneaky'), (e: any) => e.status === 404); // not their field
  });

  test('S-010: marking done moves the alert from open to done (and twice is harmless)', async () => {
    const r = await sam('POST', `/api/alerts/${alertId}/done`);
    assert.equal(r.status, 200);
    assert.equal(r.body.alert.status, 'done');
    assert.ok(r.body.alert.doneAt);
    assert.deepEqual((await sam('GET', '/api/alerts?status=open')).body.alerts, []);
    assert.deepEqual((await sam('GET', '/api/alerts?status=done')).body.alerts.map((a: any) => a.id), [alertId]);
    assert.equal((await sam('POST', `/api/alerts/${alertId}/done`)).body.alert.doneAt, r.body.alert.doneAt);
  });

  test('done stays done for 12 hours; after that the advice rule can raise it again', async () => {
    assert.equal(await openAlert(samId, fieldId, message), null);
    assert.equal(await openAlert(samId, fieldId, message, new Date(Date.now() + 11 * 3_600_000)), null);
    const next = await openAlert(samId, fieldId, message, new Date(Date.now() + 13 * 3_600_000));
    assert.ok(next && next.id !== alertId);
    const all = (await sam('GET', '/api/alerts')).body.alerts;
    assert.deepEqual(all.map((a: any) => a.id), [next.id, alertId], 'newest first');
  });

  test('an alert opening while its field is being removed never outlives the field', async () => {
    const farm = (await sam('GET', '/api/farms')).body.farms.find((f: any) => f.name === 'Alert Farm');
    const crop = (await sam('GET', '/api/crop-profiles')).body.cropProfiles[0];
    const racing = (await sam('POST', `/api/farms/${farm.id}/fields`, { name: 'Racing block', cropProfileId: crop.id })).body.field.id;
    const results = await Promise.allSettled([
      openAlert(samId, racing, message),
      sam('DELETE', `/api/fields/${racing}`),
      openAlert(samId, racing, message),
      openAlert(samId, racing, message),
    ]);
    for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.status, 404); // only "field not found"
    assert.deepEqual(await listAll((await db()).alert, { fieldId: racing }), []);
  });

  test('removing the field removes its alerts, and no alert can open for it afterwards', async () => {
    await sam('DELETE', `/api/fields/${fieldId}`);
    assert.deepEqual(await listAll((await db()).alert, { fieldId }), []);
    await assert.rejects(openAlert(samId, fieldId, message), (e: any) => e.status === 404);
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
