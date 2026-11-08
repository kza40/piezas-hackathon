// piezas-scenario: S-004 v=1
import { expect, test } from '@playwright/test';
import { createFarmAndField, registerSensor, signUp } from './helpers';

test('S-004: valid device key accepts a reading and a bad key is rejected', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await page.getByTestId('field-card').filter({ hasText: 'Blueberry Field' }).getByTestId('open-field').click();
  await registerSensor(page);
  const key = (await page.getByTestId('device-key-once').textContent())?.trim();
  await page.getByTestId('device-reading-type').selectOption('soil_moisture');
  await page.getByTestId('device-reading-value').fill('27.4');
  await page.getByTestId('device-reading-unit').fill('%');
  await page.getByTestId('send-device-reading').click();
  await expect(page.getByTestId('ingest-result')).toContainText('accepted');
  await page.getByTestId('device-key-input').fill('fwk_invalid');
  await page.getByTestId('send-device-reading').click();
  await expect(page.getByTestId('ingest-error')).toBeVisible();
  expect(key).toBeTruthy();
});
