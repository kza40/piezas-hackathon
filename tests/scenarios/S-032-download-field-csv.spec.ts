// piezas-scenario: S-032 v=1
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createFarmAndField, signUp } from './helpers';

test("S-032: farmer downloads a field's readings", async ({ page }) => {
  await signUp(page);
  await createFarmAndField(page, 'Export Farm', 'Blueberry Field');
  await page.getByTestId('dock-field').click();
  await expect(page.getByTestId('panel-field')).toContainText('Blueberry Field');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  await expect(page.getByRole('status')).toContainText('Downloaded CSV');
  expect(download.suggestedFilename()).toBe('blueberry-field-export.csv');
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv.split('\n')[0]).toBe('exportedAt,rangeDays,farm,field,crop,sensor,type,value,unit,time,adviceLabel,adviceReason,rainNext48hMm,overnightLowC');
  expect(csv).toContain('Export Farm,Blueberry Field,Blueberries');
});
