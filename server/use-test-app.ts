// Imported first by server/index.ts: with --test-app, the server talks to the TEST Piezas app.
// It must be its own module because imports run before the importing file's own code.
if (process.argv.includes('--test-app')) {
  if (!process.env.PIEZAS_TEST_API_KEY) throw new Error('PIEZAS_TEST_API_KEY missing: run `npx piezas test --setup`');
  process.env.PIEZAS_API_KEY = process.env.PIEZAS_TEST_API_KEY;
}
export {};
