// piezas-scenario: S-014 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-014: in-range soil shows no warning', async ({ page }) => {
  await signIn(page, 'healthy-soil@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Healthy Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('soil-warning')).toHaveCount(0);
});
