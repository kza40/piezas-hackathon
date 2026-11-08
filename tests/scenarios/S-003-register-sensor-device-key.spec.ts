// piezas-scenario: S-003 v=1
import { expect, test } from '@playwright/test';
import { createFarmAndField, registerSensor, signUp } from './helpers';

test('S-003: farmer registers a sensor and gets a device key', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await page.getByTestId('field-card').filter({ hasText: 'Blueberry Field' }).getByTestId('open-field').click();
  await registerSensor(page);
  await expect(page.getByTestId('device-key-once')).toBeVisible();
});
