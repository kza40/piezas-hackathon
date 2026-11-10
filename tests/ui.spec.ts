import { expect, test, type Page } from '@playwright/test';
import { createFarmAndField, signUp } from './scenarios/helpers';

// UI guarantees that are not SPEC scenarios: a real farm never sees the demo simulator's numbers or its
// watering guess, and the side rail can be resized without getting stuck.

async function signInAsSam(page: Page) {
  await page.goto('/#login');
  await page.getByTestId('login-email').fill('sam@willowcreekfarm.ca');
  await page.getByTestId('login-password').fill('farm123-demo');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
}

const loaded = (page: Page) => expect(page.locator('.tb-sync.wait')).toHaveCount(0, { timeout: 90_000 });

test('a field whose advice fails says so, and is never told to water by guesswork', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route(/\/api\/fields\/[^/]+\/advice/, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }));
  await signInAsSam(page);
  await loaded(page);
  await expect(page.getByTestId('farm-verdict')).toContainText('Couldn’t load advice for');
  await expect(page.getByTestId('farm-verdict')).not.toContainText('today.');
  await page.getByTestId('dock-recs').click();
  await expect(page.getByTestId('recs-lead')).toContainText('Couldn’t load advice right now');
  await expect(page.locator('.rrow')).not.toHaveCount(0); // each field listed, saying its advice is unavailable
});

test('signing out and back in shows Loading again, not the last session', async ({ page }) => {
  test.setTimeout(150_000);
  await signInAsSam(page);
  await loaded(page);
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('settings-sign-out').click();
  await expect(page.getByTestId('login-page')).toBeVisible();
  // Hold the advice back, so the second sign-in is caught before its load lands.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/fields\/[^/]+\/advice/, async (r) => {
    await held;
    await r.continue();
  });
  await signInAsSam(page);
  await expect(page.locator('.tb-sync.wait')).toBeVisible();
  await expect(page.getByTestId('farm-verdict')).toHaveCount(0);
  release();
  await loaded(page);
});

test('a new field with no probes shows dashes, not made-up readings', async ({ page }) => {
  test.setTimeout(150_000);
  await signUp(page);
  await createFarmAndField(page);
  await page.reload(); // back on the map with the rail, whichever panel adding the field left open
  await loaded(page);
  await expect(page.getByTestId('card-field')).toContainText('No moisture reading yet');
  await expect(page.getByTestId('card-today')).toContainText('—');
  await page.getByRole('button', { name: '2D', exact: true }).click(); // the popup checked here is the 2D map's
  const popup = await page.locator('#fmap .fhud').first().textContent();
  expect(popup).toContain('No moisture reading yet');
  expect(popup).not.toContain('Infinity');
});

test('the rail resizes, and a re-render mid-drag does not leave the map unclickable', async ({ page }) => {
  test.setTimeout(180_000); // the first live load alone can take a minute when the suite runs in parallel
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAsSam(page);
  const grip = page.getByTestId('rail-grip');
  const rail = page.getByTestId('side-rail');
  await loaded(page); // a background render would replace the rail between the measurements below
  await expect(rail).toBeVisible();
  const before = (await rail.boundingBox())!.width;
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + 200);
  await page.mouse.down();
  await page.mouse.move(g.x - 100, g.y + 200, { steps: 5 });
  // What a background render does: the grip is replaced while the button is still down.
  await page.evaluate(() => {
    const old = document.querySelector('.rail-grip')!;
    old.replaceWith(old.cloneNode(true));
  });
  await page.mouse.move(g.x - 120, g.y + 200, { steps: 2 });
  await page.mouse.up();
  await expect(page.locator('body.resizing')).toHaveCount(0);
  expect((await rail.boundingBox())!.width).toBeGreaterThan(before + 80);
  // Keyboard: Home puts it back.
  await page.getByTestId('rail-grip').focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => Math.round((await rail.boundingBox())!.width)).toBe(360);
});
