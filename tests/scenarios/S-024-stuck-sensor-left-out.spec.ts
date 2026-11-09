// piezas-scenario: S-024 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the sensor health badges on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-024: stuck sensor left out', async ({ page }) => {
  await signIn(page, 'stuck-sensor@example.test');
  await openField(page, 'Stuck Sensor Field');
  await expect(page.getByTestId('sensor-status').filter({ hasText: 'Check sensor' })).toContainText('stuck');
  await expect(page.getByTestId('watering-recommendation')).toContainText('Wait');
  await expect(page.getByTestId('watering-reason')).toContainText('Healthy probe');
});
