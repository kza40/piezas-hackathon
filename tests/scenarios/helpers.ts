import { expect, type Page } from '@playwright/test';

// Shared UI steps. These selectors are the stable data-testid contract used by
// the scenario suite; each test still performs its own Given/When/Then.
let nextUser = 0;

export async function signUp(page: Page) {
  const email = `scenario-${Date.now()}-${++nextUser}@example.test`;
  await page.goto('/');
  await page.getByTestId('open-sign-up').click();
  await page.getByTestId('sign-up-email').fill(email);
  await page.getByTestId('sign-up-password').fill('Scenario-pass-123');
  await page.getByTestId('sign-up-submit').click();
  await expect(page.getByTestId('farm-dashboard')).toBeVisible();
  return email;
}

export async function signIn(page: Page, email: string, password = 'Scenario-pass-123') {
  await page.goto('/');
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
}

export async function createFarm(page: Page, name = 'Scenario Farm') {
  await page.getByTestId('create-farm').click();
  await page.getByTestId('farm-name').fill(name);
  await page.getByTestId('farm-latitude').fill('49.05');
  await page.getByTestId('farm-longitude').fill('-122.30');
  await page.getByTestId('save-farm').click();
  await expect(page.getByTestId('farm-card')).toContainText(name);
}

export async function createField(page: Page, name = 'Blueberry Field', crop = 'Blueberries') {
  await page.getByTestId('add-field').click();
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('field-crop').selectOption({ label: crop });
  await page.getByTestId('save-field').click();
  await expect(page.getByTestId('field-card')).toContainText(name);
}

export async function openField(page: Page, name = 'Blueberry Field') {
  await page.getByTestId('field-card').filter({ hasText: name }).getByTestId('open-field').click();
}

export async function createFarmAndField(page: Page, farm = 'Scenario Farm', field = 'Blueberry Field') {
  await createFarm(page, farm);
  await page.getByTestId('farm-card').filter({ hasText: farm }).getByTestId('open-farm').click();
  await createField(page, field);
}

export async function registerSensor(page: Page, name = 'Scenario Probe') {
  await page.getByTestId('register-sensor').click();
  await page.getByTestId('sensor-name').fill(name);
  await page.getByTestId('save-sensor').click();
  await expect(page.getByTestId('device-key-once')).toBeVisible();
  await expect(page.getByTestId('sensor-status')).toContainText('Active');
}
