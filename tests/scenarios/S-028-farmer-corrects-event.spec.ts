// piezas-scenario: S-028 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the wetting events list with label buttons on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-028: farmer corrects event', async ({ page }) => {
  await signIn(page, 'irrigated-event@example.test');
  await openField(page, 'Watered Blueberry Field');
  const event = page.getByTestId('wetting-event').first();
  await event.getByTestId('event-mark-rain').click();
  await expect(event).toContainText('Rain');
  await expect(event).toContainText('your label');
  await expect(page.getByTestId('last-watered')).toContainText('Not this week');
});
