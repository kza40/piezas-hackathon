// Creates the two demo farmers as real accounts with their farms, fields and two sensors per field,
// then fills every sensor with 14 days of simulated readings ending now.
// Safe to run again: existing farms, fields and sensors are kept, missing ones are added, and the
// readings are re-simulated so they always end at "now" (run it again right before a demo).
// Run scripts/setup-app.ts on the same app first.
//   npx tsx --env-file=.env scripts/seed-demo.ts          (test app)
//   npx tsx --env-file=.env scripts/seed-demo.ts --live   (live app, only with the owner's go)
export {};

const live = process.argv.includes('--live');
const key = live ? process.env.PIEZAS_API_KEY : process.env.PIEZAS_TEST_API_KEY;
if (!key) {
  console.error(`${live ? 'PIEZAS_API_KEY' : 'PIEZAS_TEST_API_KEY'} is missing from .env`);
  process.exit(1);
}
process.env.PIEZAS_API_KEY = key;

const { piezas } = await import('../lib/server/piezas');
const { signIn } = await import('../lib/server/auth');
const { listCropProfiles } = await import('../lib/server/data/crops');
const { createFarm, createField, listFarms, listFields } = await import('../lib/server/data/farms');
const { createSensor, listSensors, simulateField } = await import('../lib/server/data/sensors');
const { updateProfile } = await import('../lib/server/data/profile');

// Locations are approximate county centres (the frontend only has the county name).
const DEMO = [
  {
    email: 'sam@willowcreekfarm.ca',
    password: 'farm123-demo', // the frontend's 'farm123' is below Piezas's 10-character minimum
    profile: { name: 'Sam Whitfield', phone: '(519) 555-0142' },
    farm: { name: 'Willow Creek Farm', latitude: 43.7, longitude: -80.37 },
    fields: [
      { name: 'North Wheat', crop: 'wheat', acres: 86, stage: 'Tillering', soil: 'Clay loam' },
      { name: 'East Canola', crop: 'canola', acres: 64, stage: 'Rosette', soil: 'Loam' },
      { name: 'South Barley', crop: 'barley', acres: 72, stage: 'Stem elongation', soil: 'Silt loam' },
    ],
  },
  {
    email: 'jordan@mapleridge.ca',
    password: 'oats456-demo', // the frontend's 'oats456' is below Piezas's 10-character minimum
    profile: { name: 'Jordan Hale', phone: '(519) 555-0198' },
    farm: { name: 'Maple Ridge Farm', latitude: 43.45, longitude: -81.1 },
    fields: [
      { name: 'West Oats', crop: 'oats', acres: 58, stage: 'Tillering', soil: 'Loam' },
      { name: 'Creek Alfalfa', crop: 'alfalfa', acres: 41, stage: 'Early bud', soil: 'Sandy loam' },
      { name: 'Blueberry Hill', crop: 'blueberry', acres: 22, stage: 'Fruit set', soil: 'Sandy loam, mulched' },
    ],
  },
];

const crops = new Map((await listCropProfiles()).map((c) => [c.key, c.id]));

for (const d of DEMO) {
  // Piezas hides whether an email exists, so sign up (a no-op if it does) and then sign in.
  try {
    await piezas().users.signUp({ email: d.email, password: d.password });
  } catch (e: any) {
    console.error(`${d.email}: sign-up refused: ${e?.message ?? e}`);
    continue;
  }
  let user;
  try {
    ({ user } = await signIn(d.email, d.password));
  } catch {
    console.error(`${d.email}: exists with a different password (or is locked); left unchanged`);
    continue;
  }
  await updateProfile(user.id, d.profile);

  const farm = (await listFarms(user.id)).find((f) => f.name === d.farm.name) ?? (await createFarm(user.id, d.farm));
  const have = new Set((await listFields(user.id, farm.id)).map((f) => f.name));
  for (const f of d.fields) {
    if (!have.has(f.name)) await createField(user.id, farm.id, { name: f.name, cropProfileId: crops.get(f.crop), acres: f.acres, stage: f.stage, soil: f.soil });
  }
  const fields = await listFields(user.id, farm.id);
  for (const f of fields) {
    // Device keys are not kept: the demo sensors are fed by the simulator, not by devices.
    if (!(await listSensors(user.id, f.id)).length) for (const name of ['North probe', 'South probe']) await createSensor(user.id, f.id, { name });
    await simulateField(user.id, f.id);
  }
  console.log(`${d.email}: ${farm.name} with ${fields.length} fields, 2 sensors each, 14 days of simulated readings`);
}
