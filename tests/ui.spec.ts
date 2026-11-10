import { expect, test, type Page } from '@playwright/test';
import { createFarmAndField, openField, signUp } from './scenarios/helpers';
import { toMapXY } from '../src/geo';

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

test('Adjust farm on the satellite map: dragging a real field saves its new place', async ({ page }) => {
  await page.route(/server\.arcgisonline\.com/, (r) => r.abort()); // the imagery is not needed for this
  await signUp(page);
  await createFarmAndField(page, 'Drag Farm', 'Home Field');
  const pin: [number, number] = [-122.3, 49.05]; // createFarm's location
  const ring: [number, number][] = [[-122.301, 49.0495], [-122.299, 49.0495], [-122.299, 49.0505], [-122.301, 49.0505]];
  const farm = (await (await page.request.get('/api/farms')).json()).farms[0];
  const field = (await (await page.request.get(`/api/farms/${farm.id}/fields`)).json()).fields[0];
  expect((await page.request.patch(`/api/fields/${field.id}`, { data: { boundary: ring } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('view-2d').click();
  await page.getByRole('button', { name: 'Adjust farm' }).click();
  await expect(page.getByTestId('adjust-note')).toContainText('line it up with the satellite image');
  await expect(page.getByRole('button', { name: 'Standard layout' })).toHaveCount(0); // nothing sketched to restore

  // Drag the field 60 screen pixels right and 30 up.
  const poly = page.locator('#fmap .fpoly').first();
  const box = (await poly.boundingBox())!;
  const unitsPerPx = await page.locator('#fmap').evaluate((svg) => {
    const r = svg.getBoundingClientRect();
    return Math.max(800 / r.width, 520 / r.height);
  });
  const [x, y] = [box.x + box.width * 0.25, box.y + box.height * 0.75]; // a spot clear of the labels
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y - 15, { steps: 4 });
  await page.mouse.move(x + 60, y - 30, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('status')).toContainText('Moved Home Field');

  // Saved on the server: the field moved about 60 px east and 30 px north on the ground.
  const saved = (await (await page.request.get(`/api/fields/${field.id}`)).json()).field.boundary as [number, number][];
  const [x0, y0] = toMapXY(ring[0], pin);
  const [x1, y1] = toMapXY(saved[0], pin);
  expect(x1 - x0).toBeCloseTo(60 * unitsPerPx, -0.5);
  expect(y1 - y0).toBeCloseTo(-30 * unitsPerPx, -0.5);
  // And still there after a reload.
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  const drawn = (await page.locator('#fmap .fpoly').first().getAttribute('points'))!.split(' ')[0].split(',').map(Number);
  expect(drawn[0]).toBeCloseTo(x1, 0);
  expect(drawn[1]).toBeCloseTo(y1, 0);
});

// R-004 / R-005 from the field page: the key is shown once, the device sends with it, and revoking it (asked
// twice, as there is no undo) makes the server refuse that device.
test("a field's sensors: add one, its key works once copied, and revoking it refuses the device", async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signUp(page);
  await createFarmAndField(page, 'Sensor Farm', 'North Field');
  await openField(page, 'North Field');
  await expect(page.getByTestId('sensors-card')).toContainText('No sensors on this field yet');

  await page.getByTestId('register-sensor').click();
  await page.getByTestId('sensor-name').fill('North probe');
  await page.getByTestId('sensor-name').press('Enter');
  const key = (await page.getByTestId('device-key-once').textContent())!.trim();
  expect(key).toMatch(/^fwk_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByTestId('sensor-status')).toContainText('Active');
  await page.getByTestId('copy-device-key').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);
  await page.getByTestId('key-saved').click();
  await expect(page.getByTestId('device-key-once')).toHaveCount(0); // shown once: gone for good

  const send = (k: string) =>
    page.request.post('/api/ingest', { headers: { 'x-device-key': k }, data: { type: 'soil_moisture', value: 27.4, unit: '%', time: new Date().toISOString() } });
  expect((await send(key)).status()).toBe(202);
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await openField(page, 'North Field');
  await expect(page.getByTestId('sensor-status')).toContainText('Online');
  await expect(page.getByTestId('sensor-row')).toContainText('27.4');

  await page.getByTestId('revoke-sensor').click();
  await page.getByRole('button', { name: 'Keep it' }).click(); // changed their mind: nothing happens
  await expect(page.getByTestId('sensor-status')).toContainText('Online');
  await page.getByTestId('revoke-sensor').click();
  await page.getByTestId('confirm-revoke').click();
  await expect(page.getByTestId('sensor-status')).toContainText('Key revoked');
  await expect(page.getByTestId('revoke-sensor')).toHaveCount(0);
  expect((await send(key)).status()).toBe(401);
});

test("a new field's sensors can be filled with simulated readings, offered only while none has reported", async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page, 'Demo Farm', 'Demo Field');
  await openField(page, 'Demo Field');
  await expect(page.getByTestId('simulate-field')).toHaveCount(0); // nothing to fill without a sensor
  await page.getByTestId('register-sensor').click();
  await page.getByTestId('sensor-name').fill('Demo probe');
  await page.getByTestId('save-sensor').click();
  await expect(page.getByTestId('sensor-status')).toContainText('waiting for its first reading');
  await page.getByTestId('simulate-field').click();
  await expect(page.getByRole('status').filter({ hasText: 'Filled Demo Field with simulated readings' })).toBeVisible();
  await expect(page.getByTestId('sensor-status')).not.toContainText('waiting');
  await expect(page.getByTestId('simulate-field')).toHaveCount(0); // it would replace readings the field now has
});

test("with two sensors: an unsaved key is never replaced, and revoking one leaves the other's button usable", async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page, 'Two Farm', 'Two Field');
  await openField(page, 'Two Field');
  await page.getByTestId('register-sensor').click();
  await page.getByTestId('sensor-name').fill('A probe');
  await page.getByTestId('save-sensor').click();
  const keyA = (await page.getByTestId('device-key-once').textContent())!.trim();

  // Adding the next one before saving A's key keeps it: it can't be shown again.
  await page.getByTestId('register-sensor').click();
  await expect(page.getByRole('status').filter({ hasText: 'Copy the key for A probe first' })).toBeVisible();
  await expect(page.getByTestId('device-key-once')).toHaveText(keyA);
  await expect(page.getByTestId('sensor-name')).toHaveCount(0);

  await page.getByTestId('key-saved').click();
  await page.getByTestId('register-sensor').click();
  await page.getByTestId('sensor-name').fill('B probe');
  await page.getByTestId('save-sensor').click();
  await page.getByTestId('key-saved').click();
  await expect(page.getByTestId('sensor-row')).toHaveCount(2);

  await page.getByTestId('revoke-sensor').first().click();
  await page.getByTestId('confirm-revoke').click();
  await expect(page.getByTestId('sensor-status').first()).toContainText('Key revoked');
  await expect(page.getByTestId('revoke-sensor')).toHaveCount(1);
  await expect(page.getByTestId('revoke-sensor')).toBeEnabled(); // B's: unlocked once A's revoke is done
});

test("a field's sensors that are loading or failed to load are never shown as none", async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page, 'Load Farm', 'Load Field');
  // Hold the sensor list: until it arrives the field page is still loading, never "no sensors", nothing to add.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/fields\/[^/]+\/sensors$/, async (r) => {
    if (r.request().method() !== 'GET') return r.continue();
    await held;
    await r.continue();
  });
  await page.reload();
  await page.getByTestId('dock-field').click();
  await expect(page.getByText('Loading your farm’s readings')).toBeVisible();
  await expect(page.getByText('No sensors on this field yet')).toHaveCount(0);
  await expect(page.getByTestId('register-sensor')).toHaveCount(0);
  release();
  await expect(page.getByText('No sensors on this field yet')).toBeVisible();

  // A list that fails to load says so, rather than inviting a second copy of a probe.
  await page.unroute(/\/api\/fields\/[^/]+\/sensors$/);
  await page.route(/\/api\/fields\/[^/]+\/sensors$/, (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, body: '{}' }) : r.continue()));
  await page.reload();
  await page.getByTestId('dock-field').click();
  await expect(page.getByTestId('sensors-failed')).toBeVisible();
  await expect(page.getByText('No sensors on this field yet')).toHaveCount(0);
  await expect(page.getByTestId('register-sensor')).toHaveCount(0);
});
