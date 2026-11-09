// Creates the two demo farmers as real accounts with their farms, fields and sensors, then fills every
// sensor with 14 days of simulated readings ending now.
// Sam's farm is the showcase: each field has a demo scenario (lib/server/demo.ts), so it always shows
// fields that need attention next to fields that are fine, and those fields refresh themselves when read.
// Safe to run again: existing farms, fields and sensors are kept, missing ones are added, Sam's fields
// are reset to their scenario (settings, trigger, labels), and all readings are re-simulated to end now.
// Run it again right before a demo to undo whatever was changed while trying the app.
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

const { piezas, db } = await import('../lib/server/piezas');
const { signIn } = await import('../lib/server/auth');
const { listCropProfiles } = await import('../lib/server/data/crops');
const { createFarm, createField, listFarms, listFields, updateFieldSettings } = await import('../lib/server/data/farms');
const { createSensor, listSensors, simulateField } = await import('../lib/server/data/sensors');
const { updateProfile } = await import('../lib/server/data/profile');
type Scenario = import('../lib/server/demo').DemoScenario;

interface DemoField {
  name: string;
  crop: string;
  acres: number;
  stage: string;
  soil: string;
  irrigated?: boolean;
  trigger?: number; // saved soil-moisture trigger, %
  scenario?: Scenario;
  probes?: string[];
}

// Locations are approximate county centres (the frontend only has the county name).
const DEMO: { email: string; password: string; profile: { name: string; phone: string }; farm: { name: string; latitude: number; longitude: number }; fields: DemoField[] }[] = [
  {
    email: 'sam@willowcreekfarm.ca',
    password: 'farm123-demo', // the frontend's 'farm123' is below Piezas's 10-character minimum
    profile: { name: 'Sam Whitfield', phone: '(604) 555-0142' },
    // Fraser Valley, BC: where the crop guidance and the blueberry fields come from.
    farm: { name: 'Willow Creek Farm', latitude: 49.08, longitude: -122.25 },
    fields: [
      // Need attention
      { name: 'Bluecrop Block', crop: 'blueberry', acres: 18, stage: 'Fruit set', soil: 'Sandy loam', irrigated: true, trigger: 28, scenario: 'water_today' },
      { name: 'Duke Block', crop: 'blueberry', acres: 14, stage: 'Fruit set', soil: 'Sandy loam', irrigated: true, trigger: 27, scenario: 'stuck_sensor', probes: ['North probe', 'South probe', 'Row 4 probe'] },
      { name: 'South Barley', crop: 'barley', acres: 72, stage: 'Stem elongation', soil: 'Silt loam', scenario: 'low_ph' },
      { name: 'East Canola', crop: 'canola', acres: 64, stage: 'Rosette', soil: 'Loam', scenario: 'offline' },
      // Set up next
      { name: 'New Alfalfa', crop: 'alfalfa', acres: 26, stage: 'Vegetative', soil: 'Sandy loam', irrigated: true, scenario: 'setup' },
      // Fine
      { name: 'River Alfalfa', crop: 'alfalfa', acres: 35, stage: 'Early bud', soil: 'Sandy loam', irrigated: true, trigger: 27, scenario: 'wait_window' },
      { name: 'North Wheat', crop: 'wheat', acres: 86, stage: 'Tillering', soil: 'Clay loam', scenario: 'steady' },
    ],
  },
  {
    email: 'jordan@mapleridge.ca',
    password: 'oats456-demo', // the frontend's 'oats456' is below Piezas's 10-character minimum
    profile: { name: 'Jordan Hale', phone: '(519) 555-0198' },
    farm: { name: 'Maple Ridge Farm', latitude: 43.45, longitude: -81.1 },
    fields: [
      { name: 'West Oats', crop: 'oats', acres: 58, stage: 'Tillering', soil: 'Loam' },
      { name: 'Creek Alfalfa', crop: 'alfalfa', acres: 41, stage: 'Early bud', soil: 'Sandy loam', irrigated: true },
      { name: 'Blueberry Hill', crop: 'blueberry', acres: 22, stage: 'Fruit set', soil: 'Sandy loam, mulched', irrigated: true },
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
  if (farm.latitude !== d.farm.latitude || farm.longitude !== d.farm.longitude) {
    await (await db()).farm.update(farm.id, { data: { latitude: d.farm.latitude, longitude: d.farm.longitude } }); // the farm moved in this script
  }
  const have = new Set((await listFields(user.id, farm.id)).map((f) => f.name));
  for (const f of d.fields) {
    if (!have.has(f.name)) await createField(user.id, farm.id, { name: f.name, cropProfileId: crops.get(f.crop), acres: f.acres, stage: f.stage, soil: f.soil });
  }
  const fields = await listFields(user.id, farm.id);
  for (const f of fields) {
    const want = d.fields.find((x) => x.name === f.name);
    if (want?.scenario) {
      // Back to the scenario's setup; the settings change also closes any alert left open from trying it.
      await updateFieldSettings(user.id, f.id, { irrigated: !!want.irrigated, trigger: want.trigger ? { value: want.trigger } : null, soil: want.soil, stage: want.stage });
      await (await db()).field.update(f.id, { data: { demo: want.scenario, demoAt: 0, eventFeedback: {} } });
    } else if (want?.irrigated && !f.irrigated) {
      // Irrigated demo fields show the watering advice flow (R-021). Only `irrigated` is set, so a trigger saved during a demo is kept.
      await updateFieldSettings(user.id, f.id, { irrigated: true });
    }
    // Device keys are not kept: the demo sensors are fed by the simulator, not by devices.
    const probes = want?.probes ?? ['North probe', 'South probe'];
    const have = new Set((await listSensors(user.id, f.id)).map((s) => s.name));
    for (const name of probes) if (!have.has(name)) await createSensor(user.id, f.id, { name });
    await simulateField(user.id, f.id);
  }
  console.log(`${d.email}: ${farm.name} with ${fields.length} fields and 14 days of simulated readings`);
  for (const f of d.fields) if (f.scenario) console.log(`  ${f.name}: ${f.scenario}`);
}
