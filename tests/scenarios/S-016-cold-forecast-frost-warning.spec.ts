// piezas-scenario: S-016 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs the frost warning on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-016: cold night forecast shows a frost warning', async ({ page }) => {
  await signIn(page, 'cold-forecast@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Cold Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('frost-warning')).toBeVisible();
  await expect(page.getByTestId('frost-warning')).toContainText('°C');
});
