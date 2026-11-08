// In-app alerts (SPEC R-011). The advice rule calls openAlert when a field needs water; the farmer lists
// alerts and marks them done. One open alert per field (S-018), and once the farmer marks it done, no new
// one opens for that field until the next UTC day, so "done" is not undone by the next page view.
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { withLock } from '../lock';
import { badRequest } from '../errors';
import { getOwned, listAll, str } from './records';

export type AlertStatus = 'open' | 'done';
export interface Alert {
  id: string;
  fieldId: string;
  message: string;
  status: AlertStatus;
  createdAt: string;
  doneAt: string | null;
}

const toAlert = (r: EntityRecord): Alert => ({
  id: r.id,
  fieldId: str(r.data.fieldId),
  message: str(r.data.message),
  status: r.data.status === 'done' ? 'done' : 'open',
  createdAt: r.createdAt,
  doneAt: typeof r.data.doneAt === 'string' ? r.data.doneAt : null,
});

const utcDay = (iso: string) => iso.slice(0, 10);

// Whether a new alert may open for a field, given that field's alerts. Pure, so the rule is unit-tested.
export function mayOpen(alerts: Alert[], now: Date): boolean {
  const today = utcDay(now.toISOString());
  return !alerts.some((a) => a.status === 'open' || (a.doneAt !== null && utcDay(a.doneAt) === today));
}

// For the advice rule (not an HTTP route). Returns the field's open alert, creating it if allowed;
// null when the farmer already dealt with today's. Locked per field, so parallel page views make one alert.
export function openAlert(ownerId: string, fieldId: string, message: string, now = new Date()): Promise<Alert | null> {
  return withFieldAlertsLock(fieldId, async () => {
    const { alert, field } = await db();
    await getOwned(field, fieldId, ownerId, 'Field'); // inside the lock: never an alert for a field just removed
    const existing = (await listAll(alert, { ownerId, fieldId })).map(toAlert);
    const open = existing.find((a) => a.status === 'open');
    if (open) return open;
    if (!mayOpen(existing, now)) return null;
    return toAlert(await alert.create({ title: message, data: { ownerId, fieldId, message, status: 'open' } }));
  });
}

export function parseStatusFilter(v: unknown): AlertStatus | undefined {
  if (v === undefined || v === '') return undefined;
  if (v === 'open' || v === 'done') return v;
  throw badRequest('status must be open or done.');
}

// GET /api/alerts?status=open — the farmer's own alerts, newest first.
export async function listAlerts(ownerId: string, statusParam?: unknown): Promise<Alert[]> {
  const status = parseStatusFilter(statusParam);
  const { alert } = await db();
  const all = (await listAll(alert, status ? { ownerId, status } : { ownerId })).map(toAlert);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// POST /api/alerts/:id/done (S-010). Marking an alert done twice is fine and keeps the first time.
export async function markAlertDone(ownerId: string, alertId: string, now = new Date()): Promise<Alert> {
  const { alert } = await db();
  const r = toAlert(await getOwned(alert, alertId, ownerId, 'Alert'));
  if (r.status === 'done') return r;
  return toAlert(await alert.update(alertId, { data: { status: 'done', doneAt: now.toISOString() } }));
}

// The per-field lock openAlert runs under. The lock is not re-entrant: never take it twice.
export const withFieldAlertsLock = <T>(fieldId: string, fn: () => Promise<T>) => withLock(`alerts:${fieldId}`, fn);

// Used when a field is removed. The caller must hold withFieldAlertsLock (see deleteField).
export async function deleteFieldAlerts(ownerId: string, fieldId: string): Promise<void> {
  const { alert } = await db();
  for (const r of await listAll(alert, { ownerId, fieldId })) await alert.delete(r.id);
}
