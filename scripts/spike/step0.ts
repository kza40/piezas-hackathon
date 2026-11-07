// Step 0 spike: probes Piezas limits that the backend design depends on.
// Runs ONLY against the TEST copy of the app (PIEZAS_TEST_API_KEY). Throwaway: not part of the app.
// Run:  npx tsx --env-file=.env scripts/spike/step0.ts
import { Piezas } from '@piezas/sdk';

const key = process.env.PIEZAS_TEST_API_KEY;
if (!key) {
  console.error('PIEZAS_TEST_API_KEY missing (run piezas test --setup)');
  process.exit(1);
}
const piezas = new Piezas({ apiKey: key, apiBaseUrl: process.env.PIEZAS_API_URL });
const results: Record<string, any> = {};
const created: string[] = [];
const createdUsers: string[] = [];

async function exp(name: string, fn: () => Promise<any>) {
  const t = Date.now();
  try {
    const v = await fn();
    results[name] = { ok: true, ms: Date.now() - t, ...(v ?? {}) };
  } catch (e: any) {
    results[name] = {
      ok: false,
      ms: Date.now() - t,
      error: `${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 300)}`.trim(),
      status: e?.status ?? e?.statusCode,
    };
  }
  console.log(name, JSON.stringify(results[name]));
}
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const run = `${Date.now()}`;
let day: any;

await exp('E1 defineEntities', async () => {
  const defs = await piezas.defineEntities({
    spikeday: {
      fields: {
        sensorId: { type: 'text', required: true },
        readingType: { type: 'text' },
        day: { type: 'text' },
        series: { type: 'longtext' },
        count: { type: 'integer' },
        note: { type: 'text' },
      },
    },
  });
  day = (defs as any).spikeday;
  return { accessors: Object.keys(defs), hasPiezasAccessor: !!(piezas as any).spikedays };
});
if (!day) {
  console.log('define failed, stopping');
  process.exit(1);
}
const mk = async (title: string, data: any) => {
  const r = await day.create({ title, data });
  created.push(r.id);
  return r;
};

await exp('E2 create+get roundtrip', async () => {
  const r = await mk(`rt-${run}`, { sensorId: 's1', readingType: 'soil_moisture', day: '2026-11-07', series: '[1,2,3]', count: 3 });
  const g = await day.get(r.id);
  return { id: !!g.id, data: g.data, ownerId: g.ownerId ?? null, status: g.status };
});

await exp('E3 undeclared fields + nested json', async () => {
  const r = await mk(`nested-${run}`, { sensorId: 's1', extra: { a: [1, 2, 3], b: { c: 1 } }, arr: [1, 2] });
  const g = await day.get(r.id);
  return { returnedData: g.data };
});

await exp('E4 duplicate titles', async () => {
  const t = `dup-${run}`;
  await mk(t, { sensorId: 'd1' });
  await mk(t, { sensorId: 'd2' });
  const l = await day.list({ search: t, limit: 10 });
  return { countWithSameTitle: (l.data ?? []).filter((x: any) => x.title === t).length, total: l.total };
});

await exp('E5 filter on data field (exact match) + title search', async () => {
  for (let i = 0; i < 4; i++) await mk(`f-${run}-${i}`, { sensorId: i < 2 ? `fs1-${run}` : `fs2-${run}` });
  const a = await day.list({ filter: { sensorId: `fs1-${run}` }, limit: 50 });
  const b = await day.list({ search: `f-${run}`, limit: 50 });
  return { filterReturned: (a.data ?? []).length, filterAllMatch: (a.data ?? []).every((x: any) => x.data?.sensorId === `fs1-${run}`), titleSearchReturned: (b.data ?? []).length };
});

await exp('E6 payload size (longtext)', async () => {
  const out: Record<string, string> = {};
  for (const kb of [1, 10, 100, 500, 1024, 4096]) {
    try {
      const s = 'x'.repeat(kb * 1024);
      const r = await mk(`size-${kb}-${run}`, { sensorId: 'sz', series: s });
      const g = await day.get(r.id);
      out[`${kb}KB`] = (g.data?.series?.length ?? 0) === s.length ? 'ok' : `truncated to ${g.data?.series?.length}`;
    } catch (e: any) {
      out[`${kb}KB`] = `FAIL ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 120)}`;
      break;
    }
  }
  return out;
});

await exp('E7 sequential create latency (30)', async () => {
  const ms: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t = Date.now();
    await mk(`seq-${run}-${i}`, { sensorId: 'seq', count: i });
    ms.push(Date.now() - t);
  }
  return { p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(...ms) };
});

await exp('E8 concurrent creates (25 parallel)', async () => {
  const rs = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => mk(`par-${run}-${i}`, { sensorId: 'par', count: i })));
  const fails = rs.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  return { ok: rs.length - fails.length, failed: fails.length, errors: [...new Set(fails.map((f) => String(f.reason?.code ?? f.reason?.message).slice(0, 80)))] };
});

await exp('E9 bulk import (200) + idempotent replay', async () => {
  const recs = Array.from({ length: 200 }, (_, i) => ({ title: `imp-${run}-${i}`, data: { sensorId: 'imp', count: i } }));
  const key1 = `imp-${run}`;
  const t = Date.now();
  const r1 = await day.import({ records: recs }, key1);
  const first = Date.now() - t;
  const r2 = await day.import({ records: recs }, key1);
  const l = await day.list({ search: `imp-${run}`, limit: 100 });
  for (const x of r1.results ?? []) if (x?.data?.id) created.push(x.data.id);
  return { firstMs: first, created1: r1.created, failed1: r1.failed, created2OnReplay: r2.created, failed2: r2.failed, listTotalForPrefix: l.total };
});

await exp('E10 pagination limits', async () => {
  const l500 = await day.list({ limit: 500 });
  const l100 = await day.list({ limit: 100, offset: 100 });
  return { limit500Returned: (l500.data ?? []).length, total: l500.total, offset100Returned: (l100.data ?? []).length };
});

await exp('E11 sorting', async () => {
  const out: any = {};
  const d = await day.list({ sort: 'created_at', order: 'desc', limit: 3 });
  out.createdDescFirstTitle = d.data?.[0]?.title;
  try {
    await day.list({ sort: 'count' as any, limit: 3 });
    out.dataSort = 'accepted?!';
  } catch (e: any) {
    out.dataSort = `rejected: ${String(e?.message ?? e).slice(0, 100)}`;
  }
  return out;
});

await exp('E12 read-after-write', async () => {
  const t = `raw-${run}`;
  const r = await mk(t, { sensorId: 'raw' });
  const l = await day.list({ search: t, limit: 5 });
  const l2 = await day.list({ filter: { sensorId: 'raw' }, limit: 100 });
  return { foundByTitleImmediately: (l.data ?? []).some((x: any) => x.id === r.id), foundByFilterImmediately: (l2.data ?? []).some((x: any) => x.id === r.id) };
});

await exp('E13 update semantics + lost-update race', async () => {
  const r = await mk(`upd-${run}`, { sensorId: 'upd', note: 'keep-me', count: 0 });
  await day.update(r.id, { data: { count: 5 } });
  const g = await day.get(r.id);
  const merge = g.data?.note === 'keep-me';
  const inc = async () => {
    const cur = await day.get(r.id);
    await day.update(r.id, { data: { count: (cur.data?.count ?? 0) + 1 } });
  };
  await Promise.all(Array.from({ length: 20 }, inc));
  const f = await day.get(r.id);
  return { updateMergesFields: merge, afterSetCount: g.data?.count, afterTwentyParallelIncrements: f.data?.count, expectedIfNoRace: 25 };
});

await exp('E14 delete', async () => {
  const r = await day.create({ title: `del-${run}`, data: { sensorId: 'del' } });
  await day.delete(r.id);
  let getAfter = 'still readable';
  try {
    await day.get(r.id);
  } catch (e: any) {
    getAfter = `error ${e?.code ?? e?.status ?? ''}`;
  }
  const l = await day.list({ search: `del-${run}`, limit: 5 });
  return { getAfterDelete: getAfter, listedAfterDelete: (l.data ?? []).length };
});

await exp('E15 users: policy + sign-up/in/session', async () => {
  const out: any = {};
  const email = `spike-${run}@example.test`;
  const password = `Spike-${run}-Aa1!`;
  try {
    await (piezas.users as any).configurePolicy({ requireEmailVerification: false });
    out.policy = 'set requireEmailVerification=false';
  } catch (e: any) {
    out.policy = `FAIL ${String(e?.message ?? e).slice(0, 120)}`;
  }
  const su: any = await piezas.users.signUp({ email, password });
  if (su?.user?.id) createdUsers.push(su.user.id);
  out.signUpStatus = su?.user?.status;
  out.signUpReturnedToken = !!(su?.token || su?.session);
  try {
    const si: any = await piezas.users.signIn({ email, password });
    out.signInKeys = Object.keys(si ?? {});
    const token = si?.token ?? si?.session?.token ?? si?.sessionToken;
    if (token) {
      const s: any = await piezas.users.getSession(token);
      out.sessionKeys = Object.keys(s ?? {});
      out.sessionUserId = !!(s?.user?.id ?? s?.userId);
    }
  } catch (e: any) {
    out.signIn = `FAIL ${e?.code ?? ''} ${String(e?.message ?? e).slice(0, 120)}`;
  }
  return out;
});

// cleanup
let deleted = 0;
for (const id of created) {
  try {
    await day.delete(id);
    deleted++;
  } catch {}
}
for (const id of createdUsers) {
  try {
    await piezas.users.deleteUser(id);
  } catch {}
}
console.log(`cleanup: deleted ${deleted}/${created.length} records, ${createdUsers.length} user(s)`);
console.log('=== SUMMARY ===');
console.log(JSON.stringify(results, null, 2));
