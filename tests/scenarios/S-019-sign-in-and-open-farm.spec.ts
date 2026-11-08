// piezas-scenario: S-019 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-019: farmer signs in and opens their farm', async ({ page }) => {
  await signIn(page, 'sam@willowcreekfarm.ca', 'farm123-demo');
  await expect(page.getByTestId('farm-map')).toBeVisible();
  await expect(page.getByTestId('farm-card')).toContainText('Willow Creek Farm');
});
