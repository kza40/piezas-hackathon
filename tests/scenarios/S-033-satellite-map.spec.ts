// piezas-scenario: S-033 v=1
import { expect, test, type Page } from '@playwright/test';
import { toMapXY } from '../../src/geo';
import { createFarmAndField, signUp } from './helpers';

const ESRI = /server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/;
// createFarm's location (helpers.ts).
const PIN: [number, number] = [-122.3, 49.05];
const RING: [number, number][] = [
  [-122.302, 49.049],
  [-122.298, 49.049],
  [-122.298, 49.0515],
  [-122.302, 49.0515],
];

// The field's outline as drawn on the 2D map, in map units.
async function outline(page: Page) {
  const points = await page.locator('#fmap .fpoly').first().getAttribute('points');
  return points!.split(' ').map((p) => p.split(',').map(Number));
}

test("S-033: the map shows the farm's real ground", async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page, 'Satellite Farm', 'Home Field');
  // Given a saved boundary (the app has no drawing tool yet; the API saves it).
  const farm = (await (await page.request.get('/api/farms')).json()).farms[0];
  const field = (await (await page.request.get(`/api/farms/${farm.id}/fields`)).json()).fields[0];
  expect((await page.request.patch(`/api/fields/${field.id}`, { data: { boundary: RING } })).ok()).toBe(true);

  // When they open the map (imagery served as a tiny stand-in, so the test needs no internet).
  let asked = 0;
  await page.route(ESRI, (r) => {
    asked++;
    return r.fulfill({ contentType: 'image/svg+xml', body: "<svg xmlns='http://www.w3.org/2000/svg' width='2' height='2'/>" });
  });
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('view-2d').click();

  // Then the imagery is under the map, credited, and the field is drawn at its boundary.
  await expect(page.getByTestId('satellite-image')).toHaveAttribute('href', /^blob:/); // downloaded once, then drawn
  await expect(page.getByTestId('imagery-credit')).toHaveText('Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community');
  expect(asked).toBeGreaterThan(0);
  const drawn = await outline(page);
  RING.forEach((p, i) => {
    const [x, y] = toMapXY(p, PIN);
    expect(drawn[i][0]).toBeCloseTo(x, 0);
    expect(drawn[i][1]).toBeCloseTo(y, 0);
  });
  await expect(page.getByTestId('scale-bar')).toHaveText(/^\d+ (m|km)$/);
  // The scale bar follows the map's size when the side panel is resized (no redraw).
  const barWidth = () => page.locator('.sbar i').evaluate((n) => parseFloat((n as HTMLElement).style.width));
  const metres = async () => parseFloat((await page.getByTestId('scale-bar').textContent())!) * ((await page.getByTestId('scale-bar').textContent())!.includes('km') ? 1000 : 1);
  const before = (await metres()) / (await barWidth());
  for (let i = 0; i < 8; i++) await page.getByTestId('rail-grip').press('ArrowLeft'); // wider panel, narrower map
  await expect.poll(async () => (await metres()) / (await barWidth())).toBeGreaterThan(before * 1.05);

  // And when the imagery cannot be loaded, the drawn map still shows, with the field on it.
  await page.unroute(ESRI);
  await page.route(ESRI, (r) => r.abort());
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await expect(page.locator('#fmap rect[fill="url(#land)"]')).toHaveCount(1);
  await expect(page.getByTestId('satellite-image')).toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('#fmap .fpoly')).toHaveCount(1);
  await expect(page.getByTestId('imagery-credit')).toBeHidden(); // no imagery on screen, so no credit for it
});
