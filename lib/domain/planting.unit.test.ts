import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPlantingWeeks } from './planting';
import type { CropAdviceProfile, WeekClimate } from './types';

const blueberry: CropAdviceProfile = {
  name: 'Blueberries',
  moistureMin: 35,
  moistureMax: 50,
  phMin: 4.5,
  phMax: 5.5,
  ecMax: 1.0,
  frostRiskC: 0,
};

const weeks: WeekClimate[] = [
  { week: 10, avgTempC: 4, avgLowC: -2, frostChancePct: 60, avgRainMm: 40 },
  { week: 20, avgTempC: 14, avgLowC: 6, frostChancePct: 5, avgRainMm: 24 },
  { week: 22, avgTempC: 15, avgLowC: 7, frostChancePct: 2, avgRainMm: 22 },
  { week: 2, avgTempC: 1, avgLowC: -5, frostChancePct: 80, avgRainMm: 50 },
];

test('S-009-style: ranked weeks with reasons', () => {
  const ranks = rankPlantingWeeks(blueberry, weeks, 3);
  assert.equal(ranks.length, 3);
  assert.ok(ranks[0].score >= ranks[1].score);
  assert.match(ranks[0].reason, /Week/);
  assert.match(ranks[0].reason, /Blueberries/);
});