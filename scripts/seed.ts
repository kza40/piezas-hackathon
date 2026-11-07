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
  // Crop profile: crop name, moisture min, moisture max, pH min, pH max, EC max
  await upsert("cropProfiles", "Avery Example", {"cropName":"Avery Example","moistureMin":"Sample moisture min 1","moistureMax":"Sample moisture max 1","phMin":"Sample pH min 1","phMax":"Sample pH max 1","ecMax":"Sample EC max 1"});
  await upsert("cropProfiles", "Jordan Sample", {"cropName":"Jordan Sample","moistureMin":"Sample moisture min 2","moistureMax":"Sample moisture max 2","phMin":"Sample pH min 2","phMax":"Sample pH max 2","ecMax":"Sample EC max 2"});
  await upsert("cropProfiles", "Riley Placeholder", {"cropName":"Riley Placeholder","moistureMin":"Sample moisture min 3","moistureMax":"Sample moisture max 3","phMin":"Sample pH min 3","phMax":"Sample pH max 3","ecMax":"Sample EC max 3"});

  // Farm: name, longitude
  await upsert("farms", "Avery Example", {"name":"Avery Example","longitude":"Sample longitude 1"});
  await upsert("farms", "Jordan Sample", {"name":"Jordan Sample","longitude":"Sample longitude 2"});
  await upsert("farms", "Riley Placeholder", {"name":"Riley Placeholder","longitude":"Sample longitude 3"});

  // Profile: name, phone
  await upsert("profiles", "Avery Example", {"name":"Avery Example","phone":"+1 555 0110"});
  await upsert("profiles", "Jordan Sample", {"name":"Jordan Sample","phone":"+1 555 0111"});
  await upsert("profiles", "Riley Placeholder", {"name":"Riley Placeholder","phone":"+1 555 0112"});

  // Field: name, farm, crop profile, acres, growth stage, soil type
  await upsert("fields", "Avery Example", {"name":"Avery Example","farm":"Sample farm 1","cropProfile":"Sample crop profile 1","acres":"Sample acres 1","growthStage":"active","soilType":"Sample soil type 1"});
  await upsert("fields", "Jordan Sample", {"name":"Jordan Sample","farm":"Sample farm 2","cropProfile":"Sample crop profile 2","acres":"Sample acres 2","growthStage":"active","soilType":"Sample soil type 2"});
  await upsert("fields", "Riley Placeholder", {"name":"Riley Placeholder","farm":"Sample farm 3","cropProfile":"Sample crop profile 3","acres":"Sample acres 3","growthStage":"active","soilType":"Sample soil type 3"});

  // Sensor: name, field
  await upsert("sensors", "Avery Example", {"name":"Avery Example","field":"Sample field 1"});
  await upsert("sensors", "Jordan Sample", {"name":"Jordan Sample","field":"Sample field 2"});
  await upsert("sensors", "Riley Placeholder", {"name":"Riley Placeholder","field":"Sample field 3"});

  // Alert: field, message, created time
  await upsert("alerts", "Sample field 1", {"field":"Sample field 1","message":"Made-up note 1 for testing.","createdTime":"2030-01-10T15:00:00Z"});
  await upsert("alerts", "Sample field 2", {"field":"Sample field 2","message":"Made-up note 2 for testing.","createdTime":"2030-01-11T15:00:00Z"});
  await upsert("alerts", "Sample field 3", {"field":"Sample field 3","message":"Made-up note 3 for testing.","createdTime":"2030-01-12T15:00:00Z"});
}

seed().then(
  () => console.log('test information ready'),
  (error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  },
);
