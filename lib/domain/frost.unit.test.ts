import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frostWarning } from './frost';
import type { CropAdviceProfile } from './types';

const blueberry: CropAdviceProfile = {
  name: 'Blueberries',
  moistureMin: 35,
  moistureMax: 50,
  phMin: 4.5,
  phMax: 5.5,
  ecMax: 1.0,
  frostRiskC: 0,
};

test('S-016: cold night shows frost warning', () => {
  const w = frostWarning(blueberry, -1);
  assert.ok(w);
  assert.match(w!, /-1/);
});

test('S-017: mild night shows no frost warning', () => {
  assert.equal(frostWarning(blueberry, 3), null);
});