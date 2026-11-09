// piezas-scenario: S-023 v=1
import { expect, test } from '@playwright/test';
import { editProfile, signUp } from './helpers';

// A fresh account, so the demo farmer's name and phone are never changed by a test run.
test('S-023: profile details are saved', async ({ page }) => {
  await signUp(page);
  await editProfile(page);
  await page.getByTestId('profile-name').fill('Sam Example');
  await page.getByTestId('profile-phone').fill('+1 604 555 0123');
  await page.getByTestId('save-profile').click();
  await expect(page.getByText('Profile saved')).toBeVisible(); // the save finished before the reload

  await page.reload();
  await editProfile(page);
  await expect(page.getByTestId('profile-name')).toHaveValue('Sam Example');
  await expect(page.getByTestId('profile-phone')).toHaveValue('+1 604 555 0123');
});
