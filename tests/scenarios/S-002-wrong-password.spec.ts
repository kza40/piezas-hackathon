// piezas-scenario: S-002 v=1
import { expect, test } from '@playwright/test';

test('S-002 wrong password is rejected', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#login');
  await page.getByTestId('login-email').fill('sam@willowcreekfarm.ca');
  await page.getByTestId('login-password').fill('not-the-password');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('login-error')).toContainText('Wrong email or password');
});
