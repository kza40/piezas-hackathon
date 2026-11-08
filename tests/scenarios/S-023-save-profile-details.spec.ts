// piezas-scenario: S-023 v=1
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('S-023: profile details are saved', async ({ page }) => {
  await signIn(page, 'sam@willowcreekfarm.ca', 'farm123-demo');
  await page.getByTestId('open-profile').click();
  await page.getByTestId('profile-name').fill('Sam Example');
  await page.getByTestId('profile-phone').fill('+1 604 555 0123');
  await page.getByTestId('save-profile').click();
  await page.reload();
  await expect(page.getByTestId('profile-name')).toHaveValue('Sam Example');
  await expect(page.getByTestId('profile-phone')).toHaveValue('+1 604 555 0123');
});
