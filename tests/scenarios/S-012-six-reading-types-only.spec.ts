// piezas-scenario: S-012 v=1
import { expect, test } from '@playwright/test';
import { createFarmAndField, registerSensor, signUp } from './helpers';

// Not runnable yet: the field page has no sensor panel yet (register sensor, one-time device key, send a reading, revoke, simulate).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-012: only the six reading types are accepted', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await page.getByTestId('field-card').filter({ hasText: 'Blueberry Field' }).getByTestId('open-field').click();
  await registerSensor(page);
  for (const type of ['soil_moisture', 'soil_temperature', 'soil_ec', 'soil_ph', 'air_temperature', 'air_humidity']) {
    await page.getByTestId('device-reading-type').selectOption(type);
    await page.getByTestId('send-device-reading').click();
    await expect(page.getByTestId('ingest-result')).toContainText('accepted');
  }
  await page.getByTestId('device-reading-type').selectOption({ label: 'unsupported' });
  await page.getByTestId('send-device-reading').click();
  await expect(page.getByTestId('ingest-error')).toBeVisible();
});
