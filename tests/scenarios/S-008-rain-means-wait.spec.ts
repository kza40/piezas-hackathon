// piezas-scenario: S-008 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-008: dry soil but rain coming gives Wait', async ({ page }) => {
  await signIn(page, 'rain-field@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Rain Expected Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('watering-recommendation')).toContainText('Wait');
  await expect(page.getByTestId('watering-reason')).toContainText('rain');
});
