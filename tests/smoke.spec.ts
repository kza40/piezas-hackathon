import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The one test every app has. A red smoke test means nothing below it is worth
// reading: the page either renders or it does not.
test('the home page renders with a clean console', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const response = await page.goto('/');

  expect(response?.ok(), `GET / returned ${response?.status()}`).toBeTruthy();
  await expect(page.locator('body')).not.toBeEmpty();
  expect(errors, `console errors on /:\n${errors.join('\n')}`).toEqual([]);
});

// The Report a problem button is how the people trying the app tell the owner
// what went wrong, so it has to be there on the very first screen, before
// anyone signs in. Not checked when the owner turned it off or chose to go
// live without it (their decision), or for a static site (no server to save
// reports, so no button).
function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function reportButtonSkip(): string | null {
  const ownerChoice = 'The owner chose to go live without the Report a problem button, so it is not checked.';
  if (process.env.PIEZAS_REPORT_BUTTON_CHECK === 'off') return ownerChoice;
  if (process.env.PIEZAS_REPORT_BUTTON === 'off') return 'The Report a problem button is turned off for this app, so it is not checked.';
  let manifest: { deploymentMode?: string; reportButton?: boolean } = {};
  try {
    manifest = JSON.parse(readText('piezas.manifest.json') ?? '{}');
  } catch {
    // no readable manifest: treat the app as a server app
  }
  if (manifest.reportButton === false) return ownerChoice;
  // The local setting, in the order the dev server reads it.
  for (const file of ['.env.development.local', '.env.local', '.env.development', '.env']) {
    const m = /^\s*(?:export\s+)?PIEZAS_REPORT_BUTTON\s*=\s*["']?(\w+)/m.exec(readText(file) ?? '');
    if (m) {
      if (m[1].toLowerCase() === 'off') return 'The Report a problem button is turned off for this app, so it is not checked.';
      break;
    }
  }
  let mode = manifest.deploymentMode;
  if (!mode) {
    // A Next.js app exported as plain pages (output: 'export') is a static site.
    const config = ['next.config.ts', 'next.config.mjs', 'next.config.js', 'next.config.cjs'].map(readText).find((t) => t !== null);
    if (config && /\boutput\s*:\s*['"]export['"]/.test(config)) mode = 'static';
  }
  if (mode === 'static') return 'Static sites have no server to save reports, so there is no button to check.';
  return null;
}

test('the Report a problem button is on the first screen, before sign-in', async ({ page }) => {
  const skip = reportButtonSkip();
  test.skip(skip !== null, skip ?? '');

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Report a problem' })).toBeVisible();
});
