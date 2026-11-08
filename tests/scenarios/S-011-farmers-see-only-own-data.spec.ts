// piezas-scenario: S-011 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-011: farmers cannot see each others data', async ({ page }) => {
  await signIn(page, 'farmer-one@example.test');
  await expect(page.getByTestId('farm-card')).toContainText('Farmer One Farm');
  await expect(page.getByTestId('farm-card')).not.toContainText('Farmer Two Farm');
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('alert-list')).not.toContainText('Farmer Two Alert');
});
