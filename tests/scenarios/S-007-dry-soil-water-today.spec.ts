// piezas-scenario: S-007 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs the watering recommendation on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-007: dry soil and no rain gives Water today', async ({ page }) => {
  await signIn(page, 'dry-field@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Dry Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('watering-recommendation')).toContainText('Water today');
  await expect(page.getByTestId('watering-reason')).toContainText('Row 3 probe');
  await expect(page.getByTestId('watering-reason')).toContainText('rain');
});

