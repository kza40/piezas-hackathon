// piezas-scenario: S-017 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs the frost warning on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-017: mild night forecast shows no frost warning', async ({ page }) => {
  await signIn(page, 'mild-forecast@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Mild Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('frost-warning')).toHaveCount(0);
});
