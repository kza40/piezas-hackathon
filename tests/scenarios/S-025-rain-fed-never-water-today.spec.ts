// piezas-scenario: S-025 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the rain-fed field view on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-025: rain fed never water today', async ({ page }) => {
  await signIn(page, 'rain-fed@example.test');
  await openField(page, 'Dry Wheat Field');
  await expect(page.getByTestId('soil-moisture-status')).toBeVisible();
  await expect(page.getByTestId('dry-forecast-note')).toBeVisible();
  await expect(page.getByTestId('watering-recommendation')).not.toContainText('Water today');
  await page.getByTestId('open-alerts').click();
  await expect(page.getByTestId('open-alert')).toHaveCount(0);
});
