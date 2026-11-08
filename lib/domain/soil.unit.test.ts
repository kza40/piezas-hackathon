import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soilWarning } from './soil';
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

test('S-013: out-of-range pH and high EC warn', () => {
  const w = soilWarning(blueberry, { ph: 6.5, ec: 1.4 });
  assert.ok(w);
  assert.match(w!, /pH/i);
  assert.match(w!, /salt|EC/i);
  assert.match(w!, /Blueberries/);
});

test('S-014: in-range soil shows no warning', () => {
  assert.equal(soilWarning(blueberry, { ph: 5.0, ec: 0.6 }), null);
});