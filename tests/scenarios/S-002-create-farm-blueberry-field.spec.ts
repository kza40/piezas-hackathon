// piezas-scenario: S-002 v=2
import { expect, test } from '@playwright/test';
import { createFarmAndField, signUp } from './helpers';

// Not runnable yet: the field page does not show the crop's pH range yet (field-crop-ranges).
// Remove .fixme when that screen is built; this test is then its done check.
test.fixme('S-002: farmer creates a farm and a blueberry field', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await expect(page.getByTestId('field-crop-ranges')).toContainText('4.5');
  await expect(page.getByTestId('field-crop-ranges')).toContainText('5.2');
});
