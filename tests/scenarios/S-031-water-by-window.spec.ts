// piezas-scenario: S-031 v=1
import { expect, test } from '@playwright/test';
import { openField, signIn } from './helpers';

// Not runnable yet: needs the water-by window on the field page and a seeded test farmer for this case (see the signIn email).
// The backend is covered by lib/ml unit tests and server/app.int.test.ts. Remove .fixme when the screen is built.
test.fixme('S-031: water by window', async ({ page }) => {
  await signIn(page, 'water-by@example.test');
  await openField(page, 'Drying Blueberry Field');
  await expect(page.getByTestId('water-by')).toContainText('Water by');
});
