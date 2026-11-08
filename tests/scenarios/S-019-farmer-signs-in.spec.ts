// piezas-scenario: S-019 v=1
import { expect, test } from '@playwright/test';

test('S-019 farmer signs in and opens their farm', async ({ page }) => {
  await page.goto('/#login');
  await expect(page.getByTestId('login-page')).toBeVisible();
  await page.getByTestId('login-email').fill('sam@willowcreekfarm.ca');
  await page.getByTestId('login-password').fill('farm123-demo');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await expect(page.getByTestId('topbar')).toContainText('Willow Creek Farm');
});
