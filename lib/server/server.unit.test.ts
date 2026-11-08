// Pure logic: no network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, toHttp } from './errors';
import { email, number, password, text } from './validate';
import { withLock } from './lock';
import { parseFarmInput, parseFieldInput } from './data/farms';
import { parseProfileInput } from './data/profile';

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.status : 'not an AppError';
  }
  return 'did not throw';
};

test('text trims, requires a value and caps length', () => {
  assert.equal(text('Name', '  North block '), 'North block');
  assert.equal(status(() => text('Name', '   ')), 400);
  assert.equal(status(() => text('Name', 42)), 400);
  assert.equal(status(() => text('Name', 'x'.repeat(101))), 400);
});

test('number accepts numeric strings and enforces the range', () => {
  assert.equal(number('Lat', '49.05', { min: -90, max: 90 }), 49.05);
  assert.equal(number('Lat', -90, { min: -90, max: 90 }), -90);
  assert.equal(status(() => number('Lat', 91, { min: -90, max: 90 })), 400);
  assert.equal(status(() => number('Lat', 'abc', { min: -90, max: 90 })), 400);
  assert.equal(status(() => number('Lat', '', { min: -90, max: 90 })), 400);
  assert.equal(status(() => number('Lat', NaN, { min: -90, max: 90 })), 400);
});

test('email is normalised and checked; password needs 10 characters like the Piezas policy', () => {
  assert.equal(email(' Farmer@Example.TEST '), 'farmer@example.test');
  assert.equal(status(() => email('not-an-email')), 400);
  assert.equal(password('1234567890'), '1234567890');
  assert.equal(status(() => password('123456789')), 400);
});

test('farm input: name and a valid location are required', () => {
  assert.deepEqual(parseFarmInput({ name: 'Fraser Ridge', latitude: 49.05, longitude: -122.3 }), {
    name: 'Fraser Ridge',
    latitude: 49.05,
    longitude: -122.3,
  });
  assert.equal(status(() => parseFarmInput({ name: 'X', latitude: 200, longitude: 0 })), 400);
  assert.equal(status(() => parseFarmInput({ latitude: 0, longitude: 0 })), 400);
  assert.equal(status(() => parseFarmInput(null)), 400);
  assert.equal(status(() => parseFarmInput([])), 400);
});

test('farm input ignores extra keys such as a forged ownerId', () => {
  const parsed = parseFarmInput({ name: 'A', latitude: 1, longitude: 1, ownerId: 'someone-else' });
  assert.equal('ownerId' in parsed, false);
});

test('field input needs a name and a crop; acres, stage and soil are optional', () => {
  assert.deepEqual(parseFieldInput({ name: 'North', cropProfileId: 'c1' }), { name: 'North', cropProfileId: 'c1', acres: undefined, stage: undefined, soil: undefined });
  assert.deepEqual(parseFieldInput({ name: 'N', cropProfileId: 'c1', acres: '40', stage: 'Tillering', soil: '' }), {
    name: 'N',
    cropProfileId: 'c1',
    acres: 40,
    stage: 'Tillering',
    soil: undefined,
  });
  assert.equal(status(() => parseFieldInput({ name: 'North' })), 400);
  assert.equal(status(() => parseFieldInput({ name: 'N', cropProfileId: 'c1', acres: 0 })), 400);
});

test('profile input: partial, phone checked, empty phone clears it', () => {
  assert.deepEqual(parseProfileInput({ name: ' Sam ' }), { name: 'Sam' });
  assert.deepEqual(parseProfileInput({ phone: '(519) 555-0142' }), { phone: '(519) 555-0142' });
  assert.deepEqual(parseProfileInput({ phone: '' }), { phone: '' });
  assert.equal(status(() => parseProfileInput({ phone: 'call me' })), 400);
  assert.equal(status(() => parseProfileInput({ phone: '-------' })), 400); // no digits
  assert.equal(status(() => parseProfileInput({ phone: '555 01' })), 400); // too few digits
  assert.deepEqual(parseProfileInput({ phone: '555-0142' }), { phone: '555-0142' });
  assert.equal(status(() => parseProfileInput({ name: '' })), 400);
});

test('toHttp turns Piezas outages into a 503 the farmer can act on', () => {
  const original = console.error;
  console.error = () => {};
  try {
    for (const code of ['rate_limited', 'network_error', 'server_error']) {
      const r = toHttp(Object.assign(new Error('upstream'), { code }));
      assert.equal(r.status, 503, code);
      assert.equal(r.body.error, 'unavailable');
    }
    assert.equal(toHttp(Object.assign(new Error('x'), { code: 'validation_failed' })).status, 500);
  } finally {
    console.error = original;
  }
});

test('toHttp maps AppError and hides unexpected errors', () => {
  assert.deepEqual(toHttp(new AppError(404, 'not_found', 'Farm not found.')), {
    status: 404,
    body: { error: 'not_found', message: 'Farm not found.' },
  });
  const original = console.error;
  console.error = () => {};
  try {
    const r = toHttp(new Error('db password is hunter2'));
    assert.equal(r.status, 500);
    assert.equal(r.body.message.includes('hunter2'), false);
  } finally {
    console.error = original;
  }
});

test('withLock runs calls for one key one at a time, and a failure does not block the next', async () => {
  let counter = 0;
  const inc = () =>
    withLock('k', async () => {
      const read = counter;
      await new Promise((r) => setTimeout(r, 2));
      counter = read + 1;
    });
  await Promise.all(Array.from({ length: 20 }, inc));
  assert.equal(counter, 20);

  await assert.rejects(withLock('k', async () => Promise.reject(new Error('boom'))));
  assert.equal(await withLock('k', async () => 'still runs'), 'still runs');
});

test('withLock does not serialise different keys', async () => {
  const order: string[] = [];
  const slow = withLock('a', async () => {
    await new Promise((r) => setTimeout(r, 20));
    order.push('a');
  });
  const fast = withLock('b', async () => {
    order.push('b');
  });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ['b', 'a']);
});
