import { expect, type Page } from '@playwright/test';

// Shared UI steps for the scenario suite; each test still does its own Given/When/Then.
// signUp, signIn, createFarm and createField use the test ids the UI has today (src/views/pages.ts).
// openField and registerSensor use the ids the field page should get once it is built
// (the S-003 to S-018 scenarios marked fixme depend on them).
let nextUser = 0;
export const PASSWORD = 'Scenario-pass-123';

// A fresh account per test, so tests never share data or trip the sign-in lockout on the demo farmer.
export async function signUp(page: Page) {
  const email = `scenario-${Date.now()}-${++nextUser}@example.test`;
  await page.goto('/#login');
  await page.getByTestId('goto-signup').click();
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(PASSWORD);
  await page.getByTestId('signup-submit').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  return email;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/#login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

// The profile page in edit mode, where the farm, fields and profile details are changed.
export async function editProfile(page: Page) {
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: 'Edit profile' }).click();
}

export async function createFarm(page: Page, name = 'Scenario Farm') {
  await editProfile(page);
  await page.getByTestId('create-farm-name').fill(name);
  await page.getByTestId('create-farm-lat').fill('49.05');
  await page.getByTestId('create-farm-lng').fill('-122.30');
  await page.getByTestId('create-farm-submit').click();
  await expect(page.getByTestId('add-field-form')).toBeVisible();
}

export async function createField(page: Page, name = 'Blueberry Field', crop = 'Blueberries') {
  await page.getByTestId('add-field-name').fill(name);
  await page.getByTestId('add-field-crop').selectOption(crop);
  await page.getByTestId('add-field-acres').fill('10');
  await page.getByTestId('add-field-submit').click();
  await expect(page.getByTestId('my-fields')).toContainText(name);
}

export async function createFarmAndField(page: Page, farm = 'Scenario Farm', field = 'Blueberry Field') {
  await createFarm(page, farm);
  await createField(page, field);
}

export async function openField(page: Page, name = 'Blueberry Field') {
  await page.getByTestId('field-card').filter({ hasText: name }).getByTestId('open-field').click();
}

export async function registerSensor(page: Page, name = 'Scenario Probe') {
  await page.getByTestId('register-sensor').click();
  await page.getByTestId('sensor-name').fill(name);
  await page.getByTestId('save-sensor').click();
  await expect(page.getByTestId('device-key-once')).toBeVisible();
  await expect(page.getByTestId('sensor-status')).toContainText('Active');
}
