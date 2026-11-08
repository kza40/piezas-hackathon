// piezas-scenario: S-022 v=2
import { expect, test } from '@playwright/test';

test('S-022 farmer adds and removes a field from profile', async ({ page }) => {
  const email = `s022-${Date.now()}@example.com`;
  const password = 'test-farm-022';
  page.on('dialog', (d) => d.accept());

  await page.goto('/#login');
  await page.getByTestId('goto-signup').click();
  await page.getByTestId('signup-name').fill('S022 Farmer');
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(password);
  await page.getByTestId('signup-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();

  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByTestId('create-farm-form')).toBeVisible();
  await page.getByTestId('create-farm-name').fill('S022 Test Farm');
  await page.getByTestId('create-farm-lat').fill('49.05');
  await page.getByTestId('create-farm-lng').fill('-122.30');
  await page.getByTestId('create-farm-submit').click();
  await expect(page.getByTestId('add-field-form')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('add-field-name').fill('South Pasture');
  await page.getByTestId('add-field-crop').selectOption('Oats');
  await page.getByTestId('add-field-acres').fill('35');
  await page.getByTestId('add-field-submit').click();
  await expect(page.getByTestId('my-fields')).toContainText('South Pasture');
  await expect(page.getByTestId('topbar')).toContainText('1 field');
  await page.getByTestId('delete-field-south-pasture').click();
  await expect(page.getByTestId('my-fields')).not.toContainText('South Pasture');
  await expect(page.getByTestId('topbar')).toContainText('0 fields');
});
