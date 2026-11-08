// piezas-scenario: S-022 v=1
import { expect, test } from '@playwright/test';

test('S-022 farmer adds and removes a field from profile', async ({ page }) => {
  await page.goto('/#login');
  await page.getByTestId('demo-sam').click();
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByTestId('add-field-form')).toBeVisible();
  await page.getByTestId('add-field-name').fill('South Pasture');
  await page.getByTestId('add-field-crop').selectOption('Oats');
  await page.getByTestId('add-field-acres').fill('35');
  await page.getByTestId('add-field-submit').click();
  await expect(page.getByTestId('my-fields')).toContainText('South Pasture');
  await expect(page.getByTestId('topbar')).toContainText('4 fields');
  await expect(page.getByTestId('field-row-south-pasture')).toContainText('South Pasture');
  await page.getByTestId('delete-field-south-pasture').click();
  await expect(page.getByTestId('my-fields')).not.toContainText('South Pasture');
  await expect(page.getByTestId('topbar')).toContainText('3 fields');
});
