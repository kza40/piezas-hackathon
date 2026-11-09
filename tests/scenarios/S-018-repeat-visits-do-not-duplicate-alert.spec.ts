// piezas-scenario: S-018 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs the watering recommendation and alerts list on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-018: repeat visits do not duplicate the watering alert', async ({ page }) => {
  await signIn(page, 'dry-field@example.test');
  for (let visit = 0; visit < 3; visit++) {
    await page.getByTestId('field-card').filter({ hasText: 'Dry Blueberry Field' }).getByTestId('open-field').click();
    await expect(page.getByTestId('watering-recommendation')).toContainText('Water today');
    await page.getByTestId('back-to-farms').click();
  }
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('open-alert')).toHaveCount(1);
});
