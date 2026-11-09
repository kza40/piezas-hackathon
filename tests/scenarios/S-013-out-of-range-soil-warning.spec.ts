// piezas-scenario: S-013 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs the soil warning on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-013: out-of-range pH or high EC shows a soil warning', async ({ page }) => {
  await signIn(page, 'soil-warning@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Soil Warning Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('soil-warning')).toContainText('pH');
});
