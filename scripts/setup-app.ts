// One-time setup of a Piezas app: sign-up without email verification, 7-day sessions, and the default crop profiles.
// Safe to run again. Defaults to the TEST app; pass --live for the live app (do that once, before the first real sign-up).
//   npx tsx --env-file=.env scripts/setup-app.ts          (test app)
//   npx tsx --env-file=.env scripts/setup-app.ts --live   (live app)
export {}; // a module, so top-level await is allowed

const live = process.argv.includes('--live');
const key = live ? process.env.PIEZAS_API_KEY : process.env.PIEZAS_TEST_API_KEY;
if (!key) {
  console.error(`${live ? 'PIEZAS_API_KEY' : 'PIEZAS_TEST_API_KEY'} is missing from .env`);
  process.exit(1);
}
process.env.PIEZAS_API_KEY = key;

const { piezas } = await import('../lib/server/piezas');
const { ensureCropProfiles, listCropProfiles } = await import('../lib/server/data/crops');
const { SESSION_TTL_SECONDS } = await import('../lib/server/auth');

const policy = await (piezas().users as any).configurePolicy({ requireEmailVerification: false, sessionTtlSeconds: SESSION_TTL_SECONDS });
console.log(`users policy: verification ${policy.requireEmailVerification ? 'on' : 'off'}, sessions ${policy.sessionTtlSeconds}s, passwords >= ${policy.passwordMinLength}`);
const { PASSWORD_MIN } = await import('../lib/server/validate');
if (policy.requireEmailVerification || policy.sessionTtlSeconds !== SESSION_TTL_SECONDS || policy.passwordMinLength !== PASSWORD_MIN) {
  console.error('The Piezas users policy does not match lib/server (auth.ts SESSION_TTL_SECONDS, validate.ts PASSWORD_MIN).');
  process.exit(1);
}
await ensureCropProfiles();
console.log(`${live ? 'LIVE' : 'test'} app ready. Crop profiles: ${(await listCropProfiles()).map((c) => c.name).join(', ')}`);
