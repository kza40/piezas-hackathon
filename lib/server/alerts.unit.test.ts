// Pure alert rules: no network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors';
import { mayOpen, parseStatusFilter, type Alert } from './data/alerts';
import { oldestFirst } from './data/records';

const now = new Date('2026-11-08T01:00:00Z'); // 5 pm in BC, already "tomorrow" in UTC
const alert = (status: 'open' | 'done', doneAt: string | null = null): Alert => ({
  id: 'a',
  fieldId: 'f',
  message: 'Water North block today',
  status,
  createdAt: '2026-11-07T16:00:00Z',
  doneAt,
});

test('a new alert opens only when none is open and none was marked done in the last 12 hours', () => {
  assert.equal(mayOpen([], now), true);
  assert.equal(mayOpen([alert('open')], now), false, 'S-018: never a second open alert');
  assert.equal(mayOpen([alert('done', '2026-11-07T23:30:00Z')], now), false, 'done 90 minutes ago, even though the UTC day changed');
  assert.equal(mayOpen([alert('done', '2026-11-07T13:00:00Z')], now), true, 'exactly 12 hours later it can open again');
  assert.equal(mayOpen([alert('done', '2026-11-07T13:00:00Z'), alert('done', '2026-11-08T00:30:00Z')], now), false, 'the latest done counts');
});

test('records made in the same second keep one order (Piezas createdAt is whole seconds)', () => {
  const r = (id: string, createdAt: string) => ({ id, createdAt });
  const a = [r('b', '2026-11-07T10:00:00Z'), r('c', '2026-11-07T09:00:00Z'), r('a', '2026-11-07T10:00:00Z')];
  assert.deepEqual([...a].sort(oldestFirst).map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual([...a].reverse().sort(oldestFirst).map((x) => x.id), ['c', 'a', 'b'], 'same order whatever order Piezas returns');
});

test('the status filter is open, done or nothing', () => {
  assert.equal(parseStatusFilter(undefined), undefined);
  assert.equal(parseStatusFilter(''), undefined);
  assert.equal(parseStatusFilter('open'), 'open');
  assert.equal(parseStatusFilter('done'), 'done');
  assert.throws(() => parseStatusFilter('closed'), (e: unknown) => e instanceof AppError && e.status === 400);
});

test('an alert closed because the field settings changed does not start the 12-hour quiet period', () => {
  assert.equal(mayOpen([{ ...alert('done', '2026-11-08T00:30:00Z'), closedBy: 'settings' }], now), true);
});
