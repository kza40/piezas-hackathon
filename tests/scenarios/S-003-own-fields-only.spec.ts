// piezas-scenario: S-003 v=1
import { expect, test } from '@playwright/test';

test('S-003 each farmer only sees their own fields', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#login');
  await page.getByTestId('demo-sam').click();
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('topbar')).toContainText('Willow Creek Farm');
  await expect(page.getByTestId('topbar')).toContainText('3 fields');
  const overview = page.getByTestId('card-today');
  await expect(overview).toContainText('North Wheat');
  await expect(overview).toContainText('East Canola');
  await expect(overview).not.toContainText('Blueberry Hill');
  await expect(overview).not.toContainText('West Oats');
});
