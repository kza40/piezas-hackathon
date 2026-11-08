// piezas-scenario: S-006 v=1
import { expect, test } from '@playwright/test';
import { createFarmAndField, registerSensor, signUp } from './helpers';

test('S-006: simulator fills each sensor with readings and trends', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await page.getByTestId('field-card').filter({ hasText: 'Blueberry Field' }).getByTestId('open-field').click();
  await registerSensor(page, 'North Probe');
  await registerSensor(page, 'South Probe');
  await page.getByTestId('simulate-field').click();
  await expect(page.getByTestId('sensor-readings')).toHaveCount(2);
  await expect(page.getByTestId('seven-day-trend')).toHaveCount(2);
});
