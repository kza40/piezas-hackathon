// piezas-scenario: S-001 v=1
import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('S-001: farmer signs up and sees an empty dashboard', async ({ page }) => {
  await signUp(page);
  await expect(page.getByTestId('farm-list')).toBeVisible();
  await expect(page.getByTestId('empty-farms')).toBeVisible();
});
