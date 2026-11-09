// piezas-scenario: S-001 v=1
import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('S-001: farmer signs up and sees an empty dashboard', async ({ page }) => {
  await signUp(page); // ends signed in, on the dashboard
  await expect(page.getByTestId('topbar')).toContainText('No farm yet');
  await expect(page.getByTestId('topbar')).toContainText('0 fields');
});
