// What a signed-in farmer is told about each field, before, during and after the live load. These guard
// the rule that a real farm never sees the demo simulator's numbers or its watering guess.
import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearFarmScope, EMPTY_FIELD, F } from '../seed/simulate';
import { S } from '../state';
import type { Field, LiveAdvice, LiveSensor } from '../types';
import { decision, farmVerdict, hasReading, liveLoading, mText, pending, ws } from './helpers';

const field = (id: string, name: string, m = 12): Field => ({ ...EMPTY_FIELD, id, name, m, mi: [30, 45] });
const advice = (status: string, label: string, reason = ''): LiveAdvice => ({ status, label, reason }) as unknown as LiveAdvice;
const probe = (m: number | null): LiveSensor => ({ id: 's', name: 'Probe', m, st: null, ph: null, h: null, online: true, ageHours: 0 });

function farm(...fields: Field[]) {
  F.splice(0, F.length, ...fields);
}

beforeEach(() => {
  S.farmerId = 'farmer-1';
  S.liveFields = [];
  S.liveAdvice = {};
  S.liveSensors = {};
  farm();
});

describe('before the first live load', () => {
  test('every field is pending and reads Loading, whatever its starting numbers say', () => {
    farm(field('a', 'North', 5));
    assert.equal(pending(F[0]), true);
    assert.equal(liveLoading(), true);
    assert.equal(ws(F[0]), 'load');
    assert.equal(decision(F[0]), 'Loading');
  });

  test('signed out, the demo is never pending', () => {
    S.farmerId = null;
    farm(field('a', 'North'));
    assert.equal(liveLoading(), false);
  });

  test('dropping the farm (sign-out) forgets which fields were loaded', () => {
    farm(field('a', 'North'));
    S.liveFields = ['a'];
    clearFarmScope();
    farm(field('a', 'North'));
    assert.equal(pending(F[0]), true, 'the same farmer signing back in sees Loading again');
  });
});

describe('after the load', () => {
  test("the server's advice decides, in its own words", () => {
    farm(field('a', 'North'), field('b', 'South'));
    S.liveFields = ['a', 'b'];
    S.liveAdvice = { a: advice('water_today', 'Water today'), b: advice('wait', 'Wait', 'Rain is coming') };
    assert.equal(ws(F[0]), 'now');
    assert.equal(decision(F[1]), 'Wait');
    assert.equal(ws(F[1]), 'rain');
  });

  test('a field whose advice failed says so; it never falls back to the demo guess', () => {
    farm(field('a', 'North', 5)); // 5% would be "Water today" by the demo's rule
    S.liveFields = ['a'];
    assert.equal(ws(F[0]), 'err');
    assert.equal(decision(F[0]), 'Advice unavailable');
  });

  test('a field with no probe reading shows a dash, not its starting number', () => {
    farm(field('a', 'North', 33), field('b', 'South', 40));
    S.liveFields = ['a', 'b'];
    S.liveSensors = { a: [], b: [probe(40)] };
    assert.equal(hasReading(F[0], 'm'), false);
    assert.equal(mText(F[0]), '—');
    assert.equal(mText(F[1]), '40%');
    assert.equal(hasReading(F[1], 'ec'), false, 'no probe measures EC');
  });
});

describe('farm verdict', () => {
  const loaded = (...fields: Field[]) => {
    farm(...fields);
    S.liveFields = fields.map((f) => f.id);
  };

  test('names each field once under its most pressing need, then the rest', () => {
    loaded(field('a', 'North'), field('b', 'South'), field('c', 'East'), field('d', 'West'), field('e', 'Creek'));
    S.liveAdvice = {
      a: advice('water_today', 'Water today'),
      b: advice('check_sensors', 'Check sensors'),
      // c: no advice (the call failed)
      d: advice('not_configured', 'Not configured'),
      e: advice('rain_fed', 'Rain-fed'),
    };
    assert.equal(
      farmVerdict(),
      'Water North today. Check the sensors in South. Couldn’t load advice for East. Set a watering trigger for West. The rest need nothing today.',
    );
  });

  test('lists three or more with commas', () => {
    loaded(field('a', 'North'), field('b', 'South'), field('c', 'East'));
    S.liveAdvice = { a: advice('water_today', 'Water today'), b: advice('water_today', 'Water today'), c: advice('water_today', 'Water today') };
    assert.equal(farmVerdict(), 'Water North, South and East today.');
  });

  test('all quiet, and no fields', () => {
    loaded(field('a', 'North'));
    S.liveAdvice = { a: advice('wait', 'Wait', 'Moisture is fine') };
    assert.equal(farmVerdict(), 'No field needs anything today.');
    loaded();
    assert.equal(farmVerdict(), 'No fields yet. Add one to get watering advice.');
  });
});
