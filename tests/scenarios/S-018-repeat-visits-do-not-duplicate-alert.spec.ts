// piezas-scenario: S-018 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-018: repeat visits do not duplicate the watering alert', async ({ page }) => {
  await signIn(page, 'dry-field@example.test');
  for (let visit = 0; visit < 3; visit++) {
    await page.getByTestId('field-card').filter({ hasText: 'Dry Blueberry Field' }).getByTestId('open-field').click();
    await expect(page.getByTestId('watering-recommendation')).toContainText('Water today');
    await page.getByTestId('back-to-farms').click();
  }
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('open-alert')).toHaveCount(1);
});
