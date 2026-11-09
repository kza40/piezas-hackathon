// piezas-scenario: S-030 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the irrigation setup card on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-030: suggested trigger saved', async ({ page }) => {
  await signIn(page, 'suggest-trigger@example.test');
  await openField(page, 'Calibrating Blueberry Field');
  const suggestion = page.getByTestId('trigger-suggestion');
  await expect(suggestion).toContainText('field capacity');
  await expect(suggestion).toContainText('irrigation');
  await suggestion.getByTestId('save-suggested-trigger').click();
  await expect(page.getByTestId('watering-recommendation')).toContainText(/Water today|Wait/);
});
