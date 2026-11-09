// piezas-scenario: S-021 v=1
import { expect, test } from '@playwright/test';

test('S-021 sign out leaves the farm', async ({ page }) => {
  await page.goto('/#login');
  await page.getByTestId('login-email').fill('sam@willowcreekfarm.ca');
  await page.getByTestId('login-password').fill('farm123-demo');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('dock-settings').click();
  await page.getByTestId('settings-sign-out').click();
  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('topbar')).toHaveCount(0);
  // Not just hidden: after a reload the server no longer knows the session, so the farm stays unreachable.
  await page.reload();
  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('topbar')).toHaveCount(0);
});
