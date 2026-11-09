// piezas-scenario: S-005 v=1
import { expect, test } from '@playwright/test';
import { createFarmAndField, registerSensor, signUp } from './helpers';

// Not runnable yet: the field page has no sensor panel yet (register sensor, one-time device key, send a reading, revoke, simulate).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-005: revoked device key stops working', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await page.getByTestId('field-card').filter({ hasText: 'Blueberry Field' }).getByTestId('open-field').click();
  await registerSensor(page);
  await page.getByTestId('revoke-sensor').click();
  await expect(page.getByTestId('sensor-status')).toContainText('Revoked');
  await page.getByTestId('send-device-reading').click();
  await expect(page.getByTestId('ingest-error')).toBeVisible();
});
