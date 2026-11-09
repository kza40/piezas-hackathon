// piezas-scenario: S-010 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs an alerts list with mark done on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-010: watering alert can be marked done', async ({ page }) => {
  await signIn(page, 'alert@example.test');
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('open-alert')).toBeVisible();
  await page.getByTestId('mark-alert-done').click();
  await expect(page.getByTestId('done-alert')).toBeVisible();
  await expect(page.getByTestId('open-alert')).toHaveCount(0);
});
