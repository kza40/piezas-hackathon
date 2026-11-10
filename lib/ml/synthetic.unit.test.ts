// R-022 / R-015 against data we did not design for the check: the synthetic set in data/synthetic,
// whose answer key (data/synthetic/scenarios.md) lists the sensors made faulty on purpose.
//
// sensorHealth judges a sensor at a moment, from what had arrived by then, so these tests replay the
// 14 days hour by hour exactly as the app would have seen them, field by field. The set is committed
// (generated with a fixed seed), so the results are repeatable; no network, no Piezas.
//
// Not covered here: R-022's disagreement rule ("check"). It needs three trusted probes in a field, and
// this set has two per field, whose daily means stay within a few points of each other anyway.
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sensorHealth, type SensorHealth } from './health';
import type { CropAdviceProfile, WeatherForecast } from '../domain/types';
import { wateringAdvice } from '../domain/watering';
import { HOUR, type SensorSeries, type WeatherHour } from './types';

const file = (name: string) => readFileSync(new URL(`../../data/synthetic/${name}`, import.meta.url), 'utf8');

interface SyntheticSensor {
  id: string;
  field_id: string;
  name: string;
  reports: string[];
}

// readings.csv: sensor_id,type,value,unit,time,source. Parsed once, each timestamp to ms once (the replay
// below slices by it 313 times). Anything malformed is collected for the first test to report, rather than
// thrown here, where it would fail the file with no test named.
const CSV_HEADER = 'sensor_id,type,value,unit,time,source';
type Reading = { time: string; value: number; ms: number };
const [csvHeader, ...csvRows] = file('readings.csv').trim().split(/\r?\n/);
const malformed: string[] = [];
const moisture = new Map<string, Reading[]>();
for (const line of csvRows) {
  const [sensorId, type, raw, , time] = line.split(',');
  if (type !== 'soil_moisture') continue;
  const value = Number(raw);
  const ms = Date.parse(time);
  if (!Number.isFinite(value) || !Number.isFinite(ms)) malformed.push(line);
  else {
    if (!moisture.has(sensorId)) moisture.set(sensorId, []);
    moisture.get(sensorId)!.push({ time, value, ms });
  }
}
for (const pts of moisture.values()) pts.sort((a, b) => a.ms - b.ms);

/** The readings that had arrived by `now`: a prefix of the sorted series (binary search, no re-parsing). */
function upTo(pts: Reading[], now: number): Reading[] {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].ms <= now) lo = mid + 1;
    else hi = mid;
  }
  return pts.slice(0, lo);
}

const soilSensors = (JSON.parse(file('sensors.json')) as SyntheticSensor[]).filter((s) => s.reports.includes('soil_moisture'));
const fields = new Map<string, SyntheticSensor[]>();
for (const s of soilSensors) fields.set(s.field_id, [...(fields.get(s.field_id) ?? []), s]);

const times = [...moisture.values()].flat().map((p) => p.ms);
const START = Math.min(...times);
const END = Math.max(...times); // the generator's "now"
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

// The set has no rain in its past: the generator puts rain only in the forecast (hours after "now"), and
// weather_history.json is weekly climate averages. So the replay passes none, and the spike rule's
// rain exemption is not exercised here.
const NO_RAIN: WeatherHour[] = [];

/** Each soil sensor's health at `now`, from the readings that had arrived by then. */
function healthAt(now: number): Map<string, SensorHealth> {
  const out = new Map<string, SensorHealth>();
  for (const sensors of fields.values()) {
    const series: SensorSeries[] = sensors.map((s) => ({
      sensorId: s.id,
      sensorName: s.name,
      points: upTo(moisture.get(s.id) ?? [], now),
    }));
    for (const h of sensorHealth(series, NO_RAIN, new Date(now))) out.set(h.sensorId, h);
  }
  return out;
}

type Replay = { now: number; health: Map<string, SensorHealth> }[];
let replayed: Replay | undefined;
/**
 * Every hour of the set, after the first day (a day of history, as the stuck rule needs). Run on first
 * use, not when the file loads, so an exception in the code under test fails the tests that need it, by
 * name and with its stack, instead of the whole file failing with no test run.
 */
function replay(): Replay {
  if (replayed) return replayed;
  const hours: Replay = [];
  for (let now = START + 24 * HOUR; now <= END; now += HOUR) hours.push({ now, health: healthAt(now) });
  return (replayed = hours);
}

const GLITCH = 'sensor_2b1';
const GLITCH_AT = END - 7 * 24 * HOUR; // scripts/synthetic/generate.ts: one reading of 90%, a week before "now"
// When the glitching probe is rightly faulty: the hour of the 90% reading (a value soil cannot hold), then
// as a spike until the reading before it leaves the rule's 24 h window, 22 hours later (the spike rule
// compares the jump with the reading just before it).
const SPIKE_HOURS = Array.from({ length: 22 }, (_, i) => iso(GLITCH_AT + (i + 1) * HOUR));
const FAULTY_HOURS = new Set([iso(GLITCH_AT), ...SPIKE_HOURS]);

describe('the synthetic set is what its answer key says', () => {
  test('readings.csv has the expected columns and every soil-moisture row parses', () => {
    assert.equal(csvHeader, CSV_HEADER);
    assert.deepEqual(malformed, []);
  });

  test('12 soil probes, two per field, hourly for 14 days', () => {
    assert.equal(soilSensors.length, 12);
    assert.deepEqual([...fields.values()].map((s) => s.length), [2, 2, 2, 2, 2, 2]);
    assert.equal((END - START) / HOUR, 14 * 24);
  });

  test(`${GLITCH} reads 90% once, at ${iso(GLITCH_AT)}, and normal either side`, () => {
    const pts = moisture.get(GLITCH)!;
    const i = pts.findIndex((p) => p.ms === GLITCH_AT);
    assert.ok(i > 0 && i < pts.length - 1, `no ${GLITCH} reading at ${iso(GLITCH_AT)} with readings either side`);
    assert.equal(pts[i].value, 90);
    assert.ok(pts[i - 1].value < 50 && pts[i + 1].value < 50);
  });
});

describe('sensor health (R-022), replayed hour by hour', () => {
  test('the 90% glitch is caught the hour it arrives: a value soil cannot hold', () => {
    const h = replay().find((x) => x.now === GLITCH_AT)!.health.get(GLITCH)!;
    assert.equal(h.status, 'faulty');
    assert.match(h.reason!, /reads 90%, which soil cannot hold/);
  });

  test('once it falls back, it is a spike with no rain for the next 22 hours, then trusted again', () => {
    const after = replay().filter((x) => x.now > GLITCH_AT);
    const flagged = after.filter((x) => x.health.get(GLITCH)!.status === 'faulty');
    assert.deepEqual(flagged.map((x) => iso(x.now)), SPIKE_HOURS);
    for (const x of flagged) assert.match(x.health.get(GLITCH)!.reason!, /jumped to 90% .* with no rain/);
  });

  test('no false alarms: no other probe is ever faulty, and the glitching one only around its glitch', () => {
    const wrong = replay().flatMap(({ now, health }) =>
      [...health.values()]
        .filter((h) => h.status === 'faulty' && !(h.sensorId === GLITCH && FAULTY_HOURS.has(iso(now))))
        .map((h) => `${iso(now)} ${h.sensorId}: ${h.reason}`),
    );
    assert.deepEqual(wrong, []);
  });

  test('a dead or late probe is not a health fault: staleness is R-015, below', () => {
    const last = replay().at(-1)!.health;
    assert.equal(last.get('sensor_2b2')!.status, 'ok');
    assert.equal(last.get('sensor_2a2')!.status, 'ok');
  });
});

describe('no recent reading (R-015) at the end of the set', () => {
  // The set's crop: blueberries. Only freshness and the driest probe are under test, so the thresholds are
  // the code's own (moisture null) and the forecast is dry.
  const crop: CropAdviceProfile = { name: 'Blueberries', moistureMin: null, moistureMax: null, phMin: 4.5, phMax: 5.2, ecMax: null, frostRiskC: null };
  const forecast: WeatherForecast = { hours: [], rainNext48hMm: 0, overnightLowC: 5, outlook: [] };
  const advise = (fieldId: string) => {
    const samples = fields.get(fieldId)!.map((s) => {
      const { time, value } = moisture.get(s.id)!.at(-1)!;
      return { sensorId: s.id, sensorName: s.name, time, value };
    });
    return wateringAdvice(crop, samples, forecast, new Date(END), { irrigated: true, trigger: 20 });
  };

  test('the late probe (8 h) and the dead probe (3 days) are stale; their neighbours are fresh', () => {
    const fresh = (fieldId: string) => Object.fromEntries(advise(fieldId).sensors.map((s) => [s.sensorId, s.fresh]));
    assert.deepEqual(fresh('field_2a'), { sensor_2a1: true, sensor_2a2: false });
    assert.deepEqual(fresh('field_2b'), { sensor_2b1: true, sensor_2b2: false });
  });

  test('the advice comes from the fresh probe, never the stale one', () => {
    assert.equal(advise('field_2a').driestSensorId, 'sensor_2a1');
    assert.equal(advise('field_2b').driestSensorId, 'sensor_2b1');
  });

  test('every other probe reported within the last 6 hours', () => {
    for (const id of ['field_1a', 'field_1b', 'field_3a', 'field_3b']) {
      assert.ok(advise(id).sensors.every((s) => s.fresh), id);
    }
  });
});
