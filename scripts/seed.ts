// Made-up information for the app's checks. Piezas writes this file from the
// data your description lists; edit it freely. Deterministic (fixed names,
// dates and amounts) so a check gives the same result today and next year.
//
// It runs ONLY against the TEST copy of the app (PIEZAS_TEST_API_KEY, made by
// `piezas test --setup`), never the live app, and it is safe to run again:
// each record is created only if it is not there yet. Names and emails are
// invented (example.test addresses never receive mail).
//
// `piezas test` runs it before every check:  npx tsx scripts/seed.ts
import { Piezas } from '@piezas/sdk';

const apiKey = process.env.PIEZAS_TEST_API_KEY;
if (!apiKey) {
  console.error('No test copy of the app yet (PIEZAS_TEST_API_KEY is missing). Run: piezas test --setup');
  process.exit(1);
}
const piezas = new Piezas({ apiKey, apiBaseUrl: process.env.PIEZAS_API_URL });

// upsert creates a record by title only when it does not exist yet. The record
// kinds must be defined by the app (piezas.defineEntities) before this runs.
async function upsert(accessor: string, title: string, data: Record<string, unknown>) {
  const records = (piezas as unknown as Record<string, any>)[accessor];
  if (!records?.list || !records?.create) {
    console.warn(`${accessor}: not defined yet; run the app once (it defines its records), then seed again`);
    return;
  }
  const found = await records.list({ search: title, limit: 10 });
  const items: any[] = Array.isArray(found) ? found : found?.data ?? found?.items ?? found?.records ?? [];
  if (items.some((r) => r?.title === title)) return;
  await records.create({ title, data });
}

// The test sign-in person: created and switched on directly with the test
// copy's key, so sign-up and sign-in checks never wait for an email.
async function testSignInUser() {
  const email = process.env.PIEZAS_TEST_USER_EMAIL;
  const password = process.env.PIEZAS_TEST_USER_PASSWORD;
  if (!email || !password) return;
  let user: any;
  try {
    ({ user } = await piezas.users.signUp({ email, password }));
  } catch {
    const listed: any = await piezas.users.listUsers({ email });
    user = (listed?.users ?? listed?.data ?? [])[0];
  }
  if (user?.id && user.status !== 'active') await piezas.users.updateUser(user.id, { status: 'active' });
}

export async function seed() {
  await testSignInUser();

}

seed().then(
  () => console.log('test information ready'),
  (error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  },
);
