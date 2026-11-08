// piezas-scenario: S-021 v=1
import { expect, test } from '@playwright/test';

test('S-021 sign out leaves the farm', async ({ page }) => {
  await page.goto('/#login');
  await page.getByTestId('demo-sam').click();
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('settings-sign-out').click();
  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('topbar')).toHaveCount(0);
});
