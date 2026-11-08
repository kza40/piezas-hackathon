// piezas-scenario: S-009 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-009: planting weeks are ranked with reasons', async ({ page }) => {
  await signIn(page, 'planting@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Blueberry Field' }).getByTestId('open-field').click();
  await page.getByTestId('open-planting-advice').click();
  await expect(page.getByTestId('planting-week')).toHaveCount(3);
  await expect(page.getByTestId('planting-week-reason').first()).toBeVisible();
  await expect(page.getByTestId('saved-planting-date')).toHaveCount(0);
});
