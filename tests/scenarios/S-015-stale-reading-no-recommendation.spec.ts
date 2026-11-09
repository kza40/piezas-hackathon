// piezas-scenario: S-015 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs sensor status and the watering recommendation on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-015: stale readings give No recent reading', async ({ page }) => {
  await signIn(page, 'stale-reading@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Stale Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('sensor-status')).toContainText('No recent reading');
  await expect(page.getByTestId('watering-recommendation')).toContainText('No recent reading');
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('open-alert')).toHaveCount(0);
});
