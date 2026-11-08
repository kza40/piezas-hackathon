// piezas-scenario: S-021 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-021: sign out leaves the farm', async ({ page }) => {
  await signIn(page, 'sam@willowcreekfarm.ca', 'farm123-demo');
  await expect(page.getByTestId('farm-map')).toBeVisible();
  await page.getByTestId('sign-out').click();
  await expect(page.getByTestId('sign-in-screen')).toBeVisible();
  await page.goto('/farms');
  await expect(page.getByTestId('sign-in-screen')).toBeVisible();
});
