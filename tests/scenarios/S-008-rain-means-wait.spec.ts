// piezas-scenario: S-008 v=2
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Not runnable yet: needs the watering recommendation on the field page and a seeded test farmer for this case (see the signIn email).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-008: dry soil but rain coming gives Wait', async ({ page }) => {
  await signIn(page, 'rain-field@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Rain Expected Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('watering-recommendation')).toContainText('Wait');
  await expect(page.getByTestId('watering-reason')).toContainText('rain');
});
