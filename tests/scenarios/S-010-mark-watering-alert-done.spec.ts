// piezas-scenario: S-010 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-010: watering alert can be marked done', async ({ page }) => {
  await signIn(page, 'alert@example.test');
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('open-alert')).toBeVisible();
  await page.getByTestId('mark-alert-done').click();
  await expect(page.getByTestId('done-alert')).toBeVisible();
  await expect(page.getByTestId('open-alert')).toHaveCount(0);
});
