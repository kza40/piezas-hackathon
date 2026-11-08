// piezas-scenario: S-020 v=2
import { expect, test } from '@playwright/test';

// Its own account, not the shared demo one: wrong passwords count toward the Piezas lockout
// (10 in 15 minutes), and a few test runs must never lock the demo farmer before a demo.
test('S-020 wrong password is rejected', async ({ page, request }) => {
  const email = `s020-${Date.now()}@example.com`;
  const signUp = await request.post('/api/auth/sign-up', { data: { email, password: 'right-password-020' } });
  expect(signUp.status()).toBe(201);

  await page.goto('/#login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill('not-the-password');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('login-error')).toBeVisible();
});
