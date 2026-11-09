// piezas-scenario: S-029 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the irrigation setup card on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-029: not configured explains missing', async ({ page }) => {
  await signIn(page, 'no-trigger@example.test');
  await openField(page, 'New Irrigated Field');
  await expect(page.getByTestId('watering-recommendation')).toContainText('not configured');
  await expect(page.getByTestId('trigger-learning')).toContainText('soaking rain or irrigation');
});
