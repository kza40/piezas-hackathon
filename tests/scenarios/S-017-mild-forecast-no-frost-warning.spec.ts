// piezas-scenario: S-017 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-017: mild night forecast shows no frost warning', async ({ page }) => {
  await signIn(page, 'mild-forecast@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Mild Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('frost-warning')).toHaveCount(0);
});
