// piezas-scenario: S-013 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-013: out-of-range pH or high EC shows a soil warning', async ({ page }) => {
  await signIn(page, 'soil-warning@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Soil Warning Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('soil-warning')).toContainText('pH');
});
