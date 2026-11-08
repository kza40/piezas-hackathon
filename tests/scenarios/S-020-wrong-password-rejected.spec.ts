// piezas-scenario: S-020 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-020: wrong password is rejected', async ({ page }) => {
  await signIn(page, 'sam@willowcreekfarm.ca', 'wrong-password');
  await expect(page.getByTestId('sign-in-screen')).toBeVisible();
  await expect(page.getByTestId('sign-in-error')).toBeVisible();
});
