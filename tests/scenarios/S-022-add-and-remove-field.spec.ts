// piezas-scenario: S-022 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-022: farmer adds and removes a field from their profile', async ({ page }) => {
  await signIn(page, 'sam@willowcreekfarm.ca', 'farm123-demo');
  await page.getByTestId('open-profile').click();
  await page.getByTestId('add-field').click();
  await page.getByTestId('field-name').fill('South Pasture');
  await page.getByTestId('field-crop').selectOption({ label: 'Oats' });
  await page.getByTestId('save-field').click();
  await expect(page.getByTestId('field-list')).toContainText('South Pasture');
  await page.getByTestId('field-list').filter({ hasText: 'South Pasture' }).getByTestId('remove-field').click();
  await expect(page.getByTestId('field-list')).not.toContainText('South Pasture');
});
