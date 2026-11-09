// piezas-scenario: S-026 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the wetting events list on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-026: irrigation detected last watered', async ({ page }) => {
  await signIn(page, 'irrigated-event@example.test');
  await openField(page, 'Watered Blueberry Field');
  const event = page.getByTestId('wetting-event').first();
  await expect(event).toContainText('Irrigation');
  await expect(event.getByTestId('sensor-rise')).toHaveCount(2);
  await expect(page.getByTestId('last-watered')).not.toContainText('Not this week');
});
