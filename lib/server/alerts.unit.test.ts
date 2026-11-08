// Pure alert rules: no network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors';
import { mayOpen, parseStatusFilter, withFieldAlertsLock, type Alert } from './data/alerts';

const now = new Date('2026-11-07T18:00:00Z');
const alert = (status: 'open' | 'done', doneAt: string | null = null): Alert => ({
  id: 'a',
  fieldId: 'f',
  message: 'Water North block today',
  status,
  createdAt: '2026-11-07T08:00:00Z',
  doneAt,
});

test('a new alert opens only when none is open and none was marked done today (UTC)', () => {
  assert.equal(mayOpen([], now), true);
  assert.equal(mayOpen([alert('open')], now), false, 'S-018: never a second open alert');
  assert.equal(mayOpen([alert('done', '2026-11-07T09:00:00Z')], now), false, 'done stays done for the rest of the day');
  assert.equal(mayOpen([alert('done', '2026-11-06T23:59:00Z')], now), true, 'a new day can raise it again');
});

test('the status filter is open, done or nothing', () => {
  assert.equal(parseStatusFilter(undefined), undefined);
  assert.equal(parseStatusFilter(''), undefined);
  assert.equal(parseStatusFilter('open'), 'open');
  assert.equal(parseStatusFilter('done'), 'done');
  assert.throws(() => parseStatusFilter('closed'), (e: unknown) => e instanceof AppError && e.status === 400);
});

test('the per-field alerts lock runs one at a time per field, and fields do not wait on each other', async () => {
  const order: string[] = [];
  const slow = (name: string, ms: number) => async () => {
    order.push(`${name}:start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${name}:end`);
  };
  await Promise.all([withFieldAlertsLock('f1', slow('a', 20)), withFieldAlertsLock('f1', slow('b', 1)), withFieldAlertsLock('f2', slow('c', 1))]);
  assert.ok(order.indexOf('b:start') > order.indexOf('a:end'), 'same field waits');
  assert.ok(order.indexOf('c:end') < order.indexOf('a:end'), 'another field does not');
});
