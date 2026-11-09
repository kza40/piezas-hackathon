// piezas-scenario: S-027 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the wetting events list on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-027: rain rise labelled rain', async ({ page }) => {
  await signIn(page, 'rain-event@example.test');
  await openField(page, 'Rained Blueberry Field');
  await expect(page.getByTestId('wetting-event').first()).toContainText('Rain');
  await expect(page.getByTestId('last-watered')).toContainText('Not this week');
});
