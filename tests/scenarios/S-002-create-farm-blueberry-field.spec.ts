// piezas-scenario: S-002 v=2
import { expect, test } from '@playwright/test';
import { createFarmAndField, signUp } from './helpers';

test('S-002: farmer creates a farm and a blueberry field', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await expect(page.getByTestId('field-crop-ranges')).toContainText('4.5');
  await expect(page.getByTestId('field-crop-ranges')).toContainText('5.2');
});
