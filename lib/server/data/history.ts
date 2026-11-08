// Reading history (SPEC R-006, R-007): one reading_day record per sensor + type + UTC day, holding that day's
// points as undeclared JSON (docs/backend-notes.md E3, E6). 14 days are kept: at most ~90 records per sensor,
// so one sensor's history is one list call. Every write here runs under the caller's per-device lock.
import type { EntityRecord } from '@piezas/sdk';
import { db } from '../piezas';
import { READING_TYPES, type Reading, type ReadingType } from '../readings';
import { listAll, str } from './records';

export const RETENTION_DAYS = 14;
export type Source = 'real' | 'simulated';
export interface Point {
  t: string; // ISO time, UTC
  v: number;
  src: Source;
}

const DAY_MS = 86_400_000;
export const dayOf = (iso: string) => iso.slice(0, 10); // ISO times are normalised UTC, so this is the UTC day
export const cutoffDay = (now: Date, days = RETENTION_DAYS) => dayOf(new Date(now.getTime() - (days - 1) * DAY_MS).toISOString());

// Same time twice: the newer write wins (a device resending a reading). Sorted by time.
export function mergePoints(existing: Point[], added: Point[]): Point[] {
  const byTime = new Map(existing.map((p) => [p.t, p]));
  for (const p of added) byTime.set(p.t, p);
  return [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
}

function storedPoints(v: unknown): Point[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p): p is Point => typeof p?.t === 'string' && typeof p?.v === 'number' && (p?.src === 'real' || p?.src === 'simulated'),
  );
}

// Readings grouped as "type|day" -> points, dropping any older than the retention window.
export function groupByDay(readings: Reading[], src: Source, now: Date): Map<string, Point[]> {
  const oldest = cutoffDay(now);
  const groups = new Map<string, Point[]>();
  for (const r of readings) {
    const day = dayOf(r.time);
    if (day < oldest) continue; // accepted, but too old to keep
    const key = `${r.type}|${day}`;
    groups.set(key, mergePoints(groups.get(key) ?? [], [{ t: r.time, v: r.value, src }]));
  }
  return groups;
}

const title = (sensorId: string, type: string, day: string) => `${sensorId}:${type}:${day}`;

// Called by ingest, under that device's lock.
export async function appendHistory(ownerId: string, sensorId: string, readings: Reading[], src: Source, now = new Date()) {
  const { reading_day } = await db();
  const groups = groupByDay(readings, src, now);
  const days = [...new Set([...groups.keys()].map((k) => k.split('|')[1]))];
  for (const day of days) {
    const existing = new Map((await listAll(reading_day, { sensorId, day })).map((r) => [str(r.data.readingType), r]));
    for (const [key, points] of groups) {
      const [type, d] = key.split('|');
      if (d !== day) continue;
      const rec = existing.get(type);
      if (rec) {
        await reading_day.update(rec.id, { data: { values: mergePoints(storedPoints(rec.data.values), points) } });
      } else {
        await reading_day.create({ title: title(sensorId, type, day), data: { ownerId, sensorId, readingType: type, day, values: points } });
        await pruneType(sensorId, type, now); // a new day started for this type: drop days past retention
      }
    }
  }
}

async function pruneType(sensorId: string, type: string, now: Date) {
  const { reading_day } = await db();
  const oldest = cutoffDay(now);
  for (const r of await listAll(reading_day, { sensorId, readingType: type })) {
    if (str(r.data.day) < oldest) await reading_day.delete(r.id);
  }
}

async function deleteInBatches(records: EntityRecord[]) {
  const { reading_day } = await db();
  for (let i = 0; i < records.length; i += 10) await Promise.all(records.slice(i, i + 10).map((r) => reading_day.delete(r.id)));
}

export async function deleteSensorHistory(ownerId: string, sensorId: string) {
  const { reading_day } = await db();
  await deleteInBatches(await listAll(reading_day, { ownerId, sensorId }));
}

// The simulator's write: the sensor's whole history becomes `readings`, in one bulk import (retry-safe, E9).
export async function replaceHistory(ownerId: string, sensorId: string, readings: Reading[], src: Source, now = new Date()) {
  const { reading_day } = await db();
  await deleteSensorHistory(ownerId, sensorId);
  const records = [...groupByDay(readings, src, now)].map(([key, values]) => {
    const [readingType, day] = key.split('|');
    return { title: title(sensorId, readingType, day), data: { ownerId, sensorId, readingType, day, values } };
  });
  if (records.length) await reading_day.import({ records }, `history-${sensorId}-${now.toISOString()}`);
}

export type Series = Partial<Record<ReadingType, { time: string; value: number }[]>>;

// Each type's points from `since` on, oldest first, plus whether any of them were simulated.
export function seriesFrom(records: EntityRecord[], since: string): { series: Series; simulated: boolean } {
  const series: Series = {};
  let simulated = false;
  const sinceDay = dayOf(since);
  for (const r of [...records].sort((a, b) => str(a.data.day).localeCompare(str(b.data.day)))) {
    const type = str(r.data.readingType) as ReadingType;
    if (!Object.hasOwn(READING_TYPES, type) || str(r.data.day) < sinceDay) continue;
    for (const p of storedPoints(r.data.values)) {
      if (p.t < since) continue;
      (series[type] ??= []).push({ time: p.t, value: p.v });
      if (p.src === 'simulated') simulated = true;
    }
  }
  return { series, simulated };
}

export async function sensorHistory(ownerId: string, sensorId: string, since: string) {
  const { reading_day } = await db();
  return seriesFrom(await listAll(reading_day, { ownerId, sensorId }), since);
}
