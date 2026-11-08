// piezas-scenario: S-002 v=1
import { expect, test } from '@playwright/test';
import { createFarmAndField, signUp } from './helpers';

test('S-002: farmer creates a farm and a blueberry field', async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page);
  await expect(page.getByTestId('field-crop-ranges')).toContainText('35');
  await expect(page.getByTestId('field-crop-ranges')).toContainText('4.5');
});
