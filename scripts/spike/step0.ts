// Step 0 spike: probes the Piezas behaviour the backend design depends on.
// Runs ONLY against the TEST copy of the app (PIEZAS_TEST_API_KEY). Not part of the app.
// It doubles as a regression check: it exits 1 if any design assumption no longer holds,
// so re-run it after upgrading @piezas/sdk.
// Run:  npx tsx --env-file=.env scripts/spike/step0.ts
// Side effect: sets requireEmailVerification=false on the test app (the tests need that anyway).
import { Piezas } from '@piezas/sdk';

const key = process.env.PIEZAS_TEST_API_KEY;
if (!key) {
  console.error('PIEZAS_TEST_API_KEY missing (run piezas test --setup)');
  process.exit(1);
}
const piezas = new Piezas({ apiKey: key, apiBaseUrl: process.env.PIEZAS_API_URL });
const run = `${Date.now()}`;
const results: Record<string, any> = {};
const createdUsers: string[] = [];

async function exp(name: string, fn: () => Promise<Record<string, unknown> | void>) {
  const t = Date.now();
  try {
    results[name] = { threw: false, ms: Date.now() - t, ...((await fn()) ?? {}) };
  } catch (e: any) {
    results[name] = { threw: true, ms: Date.now() - t, error: `${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 200)}`.trim() };
  }
  results[name].ms = Date.now() - t;
  console.log(name, JSON.stringify(results[name]));
}
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

// Must match the schema already stored in the test app: defineEntities does NOT change an
// existing schema, it only reports drift (see E3b and docs/backend-notes.md).
const { spikeday: day } = await piezas.defineEntities({
  spikeday: {
    fields: {
      run: { type: 'text' },
      sensorId: { type: 'text', required: true },
      readingType: { type: 'text' },
      series: { type: 'longtext' },
      count: { type: 'integer' },
      note: { type: 'text' },
    },
  },
});
// Every record carries data.run, so cleanup can find everything this run created, duplicates included.
const mk = (title: string, data: Record<string, unknown> = {}) => day.create({ title, data: { run, sensorId: 'spike', ...data } });
async function listAll(filter: Record<string, unknown>) {
  const all: any[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await day.list({ filter, limit: 100, offset });
    all.push(...(page.data ?? []));
    if ((page.data ?? []).length < 100) return all;
  }
}

try {
  await exp('E1 dynamic accessor name', async () => ({
    dynamicAccessors: Object.keys(piezas).filter((k) => /spike/i.test(k)),
  }));

  await exp('E2 create+get roundtrip', async () => {
    const r = await mk(`rt-${run}`, { sensorId: 's1', series: '[1,2,3]', count: 3 });
    const g = await day.get(r.id);
    return { count: g.data?.count, platformOwnerId: g.ownerId ?? null };
  });

  await exp('E3 undeclared fields + nested json', async () => {
    const r = await mk(`nested-${run}`, { extra: { a: [1, 2, 3], b: { c: 1 } } });
    const g = await day.get(r.id);
    return { nestedIntact: JSON.stringify(g.data?.extra) === JSON.stringify({ a: [1, 2, 3], b: { c: 1 } }) };
  });

  await exp('E3b missing required field', async () => {
    try {
      await day.create({ title: `req-${run}`, data: { run } });
      return { rejected: false };
    } catch (e: any) {
      return { rejected: e?.code === 'validation_failed' };
    }
  });

  await exp('E4 duplicate titles', async () => {
    await mk(`dup-${run}`);
    await mk(`dup-${run}`);
    const l = await day.list({ search: `dup-${run}`, limit: 10 });
    return { sameTitleCount: (l.data ?? []).filter((x: any) => x.title === `dup-${run}`).length };
  });

  await exp('E5 filters (one key, two keys)', async () => {
    const s1 = `fs1-${run}`;
    for (let i = 0; i < 4; i++) await mk(`f-${run}-${i}`, { sensorId: i < 2 ? s1 : `fs2-${run}`, readingType: i % 2 ? 'a' : 'b' });
    const one = await day.list({ filter: { sensorId: s1 }, limit: 50 });
    const two = await day.list({ filter: { sensorId: s1, readingType: 'a' }, limit: 50 });
    return { oneKeyReturned: one.data?.length, twoKeyReturned: two.data?.length };
  });

  await exp('E6 payload size', async () => {
    const out: Record<string, string> = {};
    for (const kb of [1, 100, 1024, 4096]) {
      const s = 'x'.repeat(kb * 1024);
      const g = await day.get((await mk(`size-${kb}-${run}`, { series: s })).id);
      out[`${kb}KB`] = g.data?.series?.length === s.length ? 'ok' : `got ${g.data?.series?.length}`;
    }
    return out;
  });

  await exp('E7 sequential create latency (30)', async () => {
    const ms: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t = Date.now();
      await mk(`seq-${run}-${i}`);
      ms.push(Date.now() - t);
    }
    return { p50: pct(ms, 50), p95: pct(ms, 95) };
  });

  await exp('E8 concurrent creates (25 parallel)', async () => {
    const rs = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => mk(`par-${run}-${i}`)));
    const fails = rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    return { succeeded: rs.length - fails.length, errors: [...new Set(fails.map((f) => String(f.reason?.code ?? f.reason?.message)))] };
  });

  await exp('E9 bulk import (200) + replay with same idempotency key', async () => {
    const sensorId = `imp-${run}`;
    const records = Array.from({ length: 200 }, (_, i) => ({ title: `imp-${run}-${i}`, data: { run, sensorId, count: i } }));
    const t = Date.now();
    const first = await day.import({ records }, `imp-${run}`);
    const firstMs = Date.now() - t;
    const replay = await day.import({ records }, `imp-${run}`);
    // Count what actually exists; the replay response may just echo the first one.
    return { firstMs, firstCreated: first.created, replayReportedCreated: replay.created, recordsActuallyStored: (await listAll({ sensorId })).length };
  });

  await exp('E10 limit above 100', async () => {
    try {
      await day.list({ limit: 101 });
      return { rejected: false };
    } catch {
      return { rejected: true };
    }
  });

  await exp('E11 sort by data field', async () => {
    try {
      await day.list({ sort: 'count' as any, limit: 1 });
      return { dataSortRejected: false };
    } catch {
      return { dataSortRejected: true };
    }
  });

  await exp('E12 read-after-write', async () => {
    const r = await mk(`raw-${run}`, { sensorId: `raw-${run}` });
    const l = await day.list({ filter: { sensorId: `raw-${run}` }, limit: 5 });
    return { visibleImmediately: (l.data ?? []).some((x: any) => x.id === r.id) };
  });

  await exp('E13 update merge + lost-update race', async () => {
    const r = await mk(`upd-${run}`, { note: 'keep-me', count: 0 });
    await day.update(r.id, { data: { count: 5 } });
    const merged = (await day.get(r.id)).data?.note === 'keep-me';
    const inc = async () => {
      const cur = await day.get(r.id);
      await day.update(r.id, { data: { count: (cur.data?.count ?? 0) + 1 } });
    };
    await Promise.all(Array.from({ length: 20 }, inc));
    return { updateMerges: merged, countAfter20ParallelIncrements: (await day.get(r.id)).data?.count, countIfNoRace: 25 };
  });

  await exp('E14 delete', async () => {
    const r = await mk(`del-${run}`);
    await day.delete(r.id);
    try {
      await day.get(r.id);
      return { goneAfterDelete: false };
    } catch (e: any) {
      return { goneAfterDelete: e?.code === 'not_found' };
    }
  });

  await exp('E15 users: policy, sign-up, sign-in, session', async () => {
    const email = `spike-${run}@example.test`;
    const password = `Spike-${run}-Aa1!`;
    await (piezas.users as any).configurePolicy({ requireEmailVerification: false });
    const su: any = await piezas.users.signUp({ email, password });
    if (su?.user?.id) createdUsers.push(su.user.id);
    const si: any = await piezas.users.signIn({ email, password });
    const token = si?.session?.token ?? si?.token;
    const s: any = token ? await piezas.users.getSession(token) : null;
    return { signUpStatus: su?.user?.status, signUpGaveToken: !!(su?.token || su?.session), signInGaveSession: !!token, sessionValid: s?.valid === true };
  });
} finally {
  const mine = await listAll({ run });
  for (const r of mine) await day.delete(r.id).catch(() => {});
  for (const id of createdUsers) await piezas.users.deleteUser(id).catch(() => {});
  const left = (await listAll({ run })).length;
  results.cleanup = { recordsDeleted: mine.length, recordsLeft: left, usersDeleted: createdUsers.length };
  console.log('cleanup', JSON.stringify(results.cleanup));
}

// Design assumptions (docs/backend-notes.md). Exit 1 if any breaks.
const r = results;
const checks: [string, boolean][] = [
  ['nested JSON is stored as-is', r['E3 undeclared fields + nested json']?.nestedIntact === true],
  ['required fields are enforced', r['E3b missing required field']?.rejected === true],
  ['filter on one data key is exact', r['E5 filters (one key, two keys)']?.oneKeyReturned === 2],
  ['filter on two data keys is AND', r['E5 filters (one key, two keys)']?.twoKeyReturned === 1],
  ['1 MB in one field is accepted', r['E6 payload size']?.['1024KB'] === 'ok'],
  ['import replay with same key does not duplicate', r['E9 bulk import (200) + replay with same idempotency key']?.recordsActuallyStored === 200],
  ['limit above 100 is rejected (we must paginate)', r['E10 limit above 100']?.rejected === true],
  ['writes are visible immediately', r['E12 read-after-write']?.visibleImmediately === true],
  ['update merges top-level data keys', r['E13 update merge + lost-update race']?.updateMerges === true],
  ['delete removes the record', r['E14 delete']?.goneAfterDelete === true],
  ['sign-up is active without email verification', r['E15 users: policy, sign-up, sign-in, session']?.signUpStatus === 'active'],
  ['sign-in gives a valid session', r['E15 users: policy, sign-up, sign-in, session']?.sessionValid === true],
  ['cleanup left nothing behind', r.cleanup?.recordsLeft === 0],
];
console.log('=== CHECKS ===');
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
