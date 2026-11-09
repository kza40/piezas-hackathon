import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wateringAdvice } from './watering';
import type { CropAdviceProfile, MoistureSample, WeatherForecast } from './types';

const blueberry: CropAdviceProfile = {
  name: 'Blueberries',
  moistureMin: 35,
  moistureMax: 50,
  phMin: 4.5,
  phMax: 5.5,
  ecMax: 1.0,
  frostRiskC: 0,
};

const now = new Date('2026-11-08T18:00:00Z');
const forecast = (rainNext48hMm: number): WeatherForecast => ({
  hours: [],
  rainNext48hMm,
  overnightLowC: 5,
  outlook: [],
});

const irrigated = { irrigated: true, trigger: 35 }; // the farmer saved a 35% trigger

const sample = (name: string, value: number, hoursAgo: number): MoistureSample => ({
  sensorId: name,
  sensorName: name,
  value,
  time: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
});

test('S-007: dry soil and no rain gives Water today and names the dry sensor', () => {
  const r = wateringAdvice(
    blueberry,
    [sample('North probe', 28, 1), sample('South probe', 40, 1)],
    forecast(0),
    now,
    irrigated,
  );
  assert.equal(r.status, 'water_today');
  assert.equal(r.label, 'Water today');
  assert.match(r.reason, /North probe/);
  assert.match(r.reason, /28/);
});

test('S-008: dry soil but heavy rain gives Wait', () => {
  const r = wateringAdvice(blueberry, [sample('North probe', 28, 1)], forecast(8), now, irrigated);
  assert.equal(r.status, 'wait');
  assert.equal(r.label, 'Wait');
  assert.match(r.reason, /rain/i);
});

test('S-015: stale readings give No recent reading', () => {
  const r = wateringAdvice(blueberry, [sample('North probe', 20, 8)], forecast(0), now, irrigated);
  assert.equal(r.status, 'no_recent_reading');
  assert.equal(r.label, 'No recent reading');
  assert.equal(r.sensors[0].fresh, false);
});
test('above the saved trigger gives Wait, naming the trigger', () => {
  const r = wateringAdvice(blueberry, [sample('North probe', 38, 1)], forecast(0), now, irrigated);
  assert.equal(r.status, 'wait');
  assert.match(r.reason, /above your 35% trigger/);
});

test('S-025: a rain-fed field never says Water today, and notes a dry forecast', () => {
  const r = wateringAdvice(blueberry, [sample('North probe', 12, 1)], forecast(0), now, { irrigated: false, trigger: 35 });
  assert.equal(r.status, 'rain_fed');
  assert.match(r.reason, /reads 12%.*rain-fed.*No rain is forecast/);
});

test('S-029: an irrigated field without a saved trigger is not configured, and shows the reading', () => {
  const r = wateringAdvice(blueberry, [sample('North probe', 12, 1)], forecast(0), now, { irrigated: true, trigger: null });
  assert.deepEqual([r.status, r.label, r.driestValue], ['not_configured', 'Not configured', 12]);
  assert.match(r.reason, /Irrigation guidance is not configured/);
});

test('R-022: when every reporting sensor is faulty, the field says Check sensors, not No recent reading', () => {
  const r = wateringAdvice(blueberry, [], forecast(0), now, { ...irrigated, faultySensors: 2 });
  assert.deepEqual([r.status, r.label, r.driestSensorId], ['check_sensors', 'Check sensors', null]);
});

test('the driest sensor is named by id as well, so two probes with one name are told apart', () => {
  const a = { ...sample('Probe', 33, 1), sensorId: 's1' };
  const b = { ...sample('Probe', 30, 1), sensorId: 's2' };
  assert.equal(wateringAdvice(blueberry, [a, b], forecast(0), now, irrigated).driestSensorId, 's2');
});
