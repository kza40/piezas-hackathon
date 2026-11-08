import { defineConfig, devices } from '@playwright/test';

// The Piezas scenario harness. `npx piezas test` runs this suite against a
// SEPARATE test copy of the app (PIEZAS_TEST_API_KEY, from `piezas test --setup`),
// never the live one, and writes .piezas/test-attestation.json — the record
// `npx piezas deploy` requires. The app is started here on its own port with
// the test copy's key. PW_BASE_URL points the suite at an app that is already
// running (previews, clips); `piezas test` ignores it unless
// PIEZAS_TEST_ALLOW_EXTERNAL_SERVER=1, since that app may use the live key.
const port = Number(process.env.PIEZAS_TEST_PORT || 3100);

export default defineConfig({
  testDir: './tests',
  outputDir: './.piezas/test-results/raw',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  reporter: 'list',
  // The first 3D map render (three.js, software WebGL in headless Chrome) blocks the page for ~3 s alone and
  // ~14 s with 4 browsers at once, so: at most 2 browsers, and 20 s per check instead of 5.
  workers: 2,
  timeout: 90_000, // a whole scenario redraws the 3D map several times
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.PW_BASE_URL || `http://localhost:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        // The real app: the built frontend and /api from one server, on the TEST copy (--test-app).
        command: process.env.PIEZAS_TEST_SERVER_CMD || 'npm run build && npx tsx --env-file=.env server/index.ts --test-app',
        port,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { PIEZAS_API_KEY: process.env.PIEZAS_TEST_API_KEY ?? '', PORT: String(port) },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
