// piezas-scenario: S-016 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-016: cold night forecast shows a frost warning', async ({ page }) => {
  await signIn(page, 'cold-forecast@example.test');
  await page.getByTestId('field-card').filter({ hasText: 'Cold Blueberry Field' }).getByTestId('open-field').click();
  await expect(page.getByTestId('frost-warning')).toBeVisible();
  await expect(page.getByTestId('frost-warning')).toContainText('°C');
});
