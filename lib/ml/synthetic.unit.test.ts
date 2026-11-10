// R-022 / R-015 against data we did not design for the check: the synthetic set in data/synthetic,
// whose answer key (data/synthetic/scenarios.md) lists the sensors made faulty on purpose.
//
// sensorHealth judges a sensor at a moment, from what had arrived by then, so these tests replay the
// 14 days hour by hour exactly as the app would have seen them, field by field. The set is committed
// (generated with a fixed seed), so the results are repeatable; no network, no Piezas.
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sensorHealth, type SensorHealth } from './health';
import { wateringAdvice } from '../domain/watering';
import { HOUR, type SensorSeries, type WeatherHour } from './types';

const file = (name: string) => readFileSync(new URL(`../../data/synthetic/${name}`, import.meta.url), 'utf8');

interface SyntheticSensor {
  id: string;
  field_id: string;
  name: string;
  reports: string[];
}

// readings.csv: sensor_id,type,value,unit,time,source, oldest first per sensor.
const moisture = new Map<string, { time: string; value: number }[]>();
for (const line of file('readings.csv').trim().split(/\r?\n/).slice(1)) {
  const [sensorId, type, value, , time] = line.split(',');
  if (type !== 'soil_moisture') continue;
  if (!moisture.has(sensorId)) moisture.set(sensorId, []);
  moisture.get(sensorId)!.push({ time, value: Number(value) });
}
for (const pts of moisture.values()) pts.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

const soilSensors = (JSON.parse(file('sensors.json')) as SyntheticSensor[]).filter((s) => s.reports.includes('soil_moisture'));
const fields = new Map<string, SyntheticSensor[]>();
for (const s of soilSensors) fields.set(s.field_id, [...(fields.get(s.field_id) ?? []), s]);

const times = [...new Set([...moisture.values()].flat().map((p) => p.time))].sort();
const START = Date.parse(times[0]);
const END = Date.parse(times.at(-1)!); // the generator's "now"
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

// The set has no hourly rain for its past (weather_history.json is weekly climate averages), so the
// replay passes none. A rain-driven rise could then look like a spike; the no-false-alarm test below
// would catch that.
const NO_RAIN: WeatherHour[] = [];

/** Each soil sensor's health at `now`, from the readings that had arrived by then. */
function healthAt(now: number): Map<string, SensorHealth> {
  const out = new Map<string, SensorHealth>();
  for (const sensors of fields.values()) {
    const series: SensorSeries[] = sensors.map((s) => ({
      sensorId: s.id,
      sensorName: s.name,
      points: (moisture.get(s.id) ?? []).filter((p) => Date.parse(p.time) <= now),
    }));
    for (const h of sensorHealth(series, NO_RAIN, new Date(now))) out.set(h.sensorId, h);
  }
  return out;
}

/** Every hour of the set, after the first day (a day of history, as the stuck rule needs). */
const replay = () => {
  const hours: { now: number; health: Map<string, SensorHealth> }[] = [];
  for (let now = START + 24 * HOUR; now <= END; now += HOUR) hours.push({ now, health: healthAt(now) });
  return hours;
};
const HOURS = replay();

const GLITCH = 'sensor_2b1';
const GLITCH_AT = END - 7 * 24 * HOUR; // scripts/synthetic/generate.ts: one reading of 90%, a week before "now"

describe('the synthetic set is what its answer key says', () => {
  test('12 soil probes, two per field, hourly for 14 days', () => {
    assert.equal(soilSensors.length, 12);
    assert.deepEqual([...fields.values()].map((s) => s.length), [2, 2, 2, 2, 2, 2]);
    assert.equal((END - START) / HOUR, 14 * 24);
  });

  test(`${GLITCH} reads 90% once, at ${iso(GLITCH_AT)}, and normal either side`, () => {
    const pts = moisture.get(GLITCH)!;
    const i = pts.findIndex((p) => p.time === iso(GLITCH_AT));
    assert.equal(pts[i].value, 90);
    assert.ok(pts[i - 1].value < 50 && pts[i + 1].value < 50);
  });
});

describe('sensor health (R-022), replayed hour by hour', () => {
  test('the 90% glitch is caught the hour it arrives: a value soil cannot hold', () => {
    const h = HOURS.find((x) => x.now === GLITCH_AT)!.health.get(GLITCH)!;
    assert.equal(h.status, 'faulty');
    assert.match(h.reason!, /reads 90%, which soil cannot hold/);
  });

  test('once it falls back, it is a spike with no rain, until it leaves the 24 h window', () => {
    const flagged = HOURS.filter((x) => x.now > GLITCH_AT && x.health.get(GLITCH)!.status === 'faulty');
    assert.ok(flagged.length > 0);
    for (const x of flagged) assert.match(x.health.get(GLITCH)!.reason!, /jumped to 90% .* with no rain/);
    assert.equal(iso(flagged[0].now), iso(GLITCH_AT + HOUR), 'flagged from the next hour');
    assert.ok(flagged.at(-1)!.now < GLITCH_AT + 24 * HOUR, 'trusted again a day later: one bad reading, not a broken probe');
    assert.equal(flagged.length, flagged.at(-1)!.now / HOUR - GLITCH_AT / HOUR, 'flagged every hour in between');
  });

  test('no false alarms: no other probe is ever faulty, and the glitching one only around its glitch', () => {
    const wrong = HOURS.flatMap(({ now, health }) =>
      [...health.values()]
        .filter((h) => h.status === 'faulty' && !(h.sensorId === GLITCH && now >= GLITCH_AT && now < GLITCH_AT + 24 * HOUR))
        .map((h) => `${iso(now)} ${h.sensorId}: ${h.reason}`),
    );
    assert.deepEqual(wrong, []);
  });

  test('with two probes a field, disagreement is never judged (it needs two others to compare with)', () => {
    for (const { health } of HOURS) for (const h of health.values()) assert.notEqual(h.status, 'check');
  });

  test('a dead or late probe is not a health fault: staleness is R-015, below', () => {
    const last = HOURS.at(-1)!.health;
    assert.equal(last.get('sensor_2b2')!.status, 'ok');
    assert.equal(last.get('sensor_2a2')!.status, 'ok');
  });
});

describe('no recent reading (R-015) at the end of the set', () => {
  const crop = { moistureMin: null, moistureMax: null } as unknown as Parameters<typeof wateringAdvice>[0];
  const forecast = { rainNext48hMm: 0 } as unknown as Parameters<typeof wateringAdvice>[2];
  const advise = (fieldId: string) => {
    const samples = fields.get(fieldId)!.map((s) => ({ sensorId: s.id, sensorName: s.name, ...moisture.get(s.id)!.at(-1)! }));
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
