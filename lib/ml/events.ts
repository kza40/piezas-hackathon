// R-023: find the times a field's soil got wetted, and label each one rain or irrigation.
//
// 1. Each sensor's series is smoothed over 3 hours, and a sharp rise (3+ points within 6 hours) is an event.
//    No labels are needed for this: it is change detection.
// 2. Rises on several sensors within 6 hours of each other are one field event.
// 3. The farm's recorded rain labels it (weak supervision): no rain means someone watered.
// 4. The farmer's own label, when given, replaces ours. Those answers are the labelled data a trained
//    classifier could later learn from.
import { HOUR, median, round1, type EventLabel, type Point, type SensorSeries, type WeatherHour } from './types';

export interface SensorRise {
  sensorId: string;
  sensorName: string;
  rise: number; // points of soil moisture
  low: boolean; // far below the field's typical rise: water may not be reaching it
}
export interface WettingEvent {
  start: string;
  peak: string;
  label: EventLabel;
  detected: Exclude<EventLabel, 'none'>; // what the app concluded, kept even when the farmer relabels
  source: 'detected' | 'farmer';
  confidence: 'high' | 'low';
  rainMm: number; // recorded rain from 6 hours before the start to the peak
  rises: SensorRise[];
}

const MIN_RISE = 3;
const RISE_HOURS = 6;
const MERGE_HOURS = 6;
const FEEDBACK_MATCH_HOURS = 3;
const POINTS_PER_MM = 1; // a rough default; a rise far beyond what the rain explains points to irrigation

export function smooth(points: Point[]): Point[] {
  return points.map((p, i) => {
    const w = points.slice(Math.max(0, i - 1), i + 2);
    return { time: p.time, value: w.reduce((s, q) => s + q.value, 0) / w.length };
  });
}

function sensorRises(points: Point[]): { start: Point; peak: Point }[] {
  const s = smooth(points);
  const found: { start: Point; peak: Point }[] = [];
  let i = 1;
  while (i < s.length - 1) {
    const ahead = s.slice(i, i + RISE_HOURS + 1);
    const top = ahead.reduce((a, b) => (b.value > a.value ? b : a));
    // Start of a rise: the lowest point before it climbs, and a climb of MIN_RISE or more.
    if (top.value - s[i].value >= MIN_RISE && s[i].value <= s[i - 1].value + 0.2) {
      let j = s.indexOf(top);
      while (j + 1 < s.length && s[j + 1].value > s[j].value) j++; // follow the climb to its peak
      let k = i; // the look-ahead found it early: start at the last reading before the climb
      while (k < j && s[k + 1].value - s[k].value < 0.5) k++;
      found.push({ start: s[k], peak: s[j] });
      i = j + RISE_HOURS;
    } else i++;
  }
  return found;
}

function valueAt(points: Point[], t: number): number | null {
  let best: Point | null = null;
  for (const p of points) if (Date.parse(p.time) <= t) best = p;
  return best ? best.value : null;
}

export function detectWettingEvents(sensors: SensorSeries[], weather: WeatherHour[], feedback: Record<string, EventLabel>): WettingEvent[] {
  const all = sensors.flatMap((s) => sensorRises(s.points).map((r) => ({ ...r, sensor: s })));
  all.sort((a, b) => Date.parse(a.start.time) - Date.parse(b.start.time));

  const clusters: (typeof all)[] = [];
  for (const r of all) {
    const last = clusters.at(-1);
    if (last && Date.parse(r.start.time) - Date.parse(last[0].start.time) <= MERGE_HOURS * HOUR) last.push(r);
    else clusters.push([r]);
  }

  const fb = Object.entries(feedback).map(([k, label]) => ({ t: Date.parse(k), label }));
  return clusters.map((c) => {
    const start = Math.min(...c.map((r) => Date.parse(r.start.time)));
    const peak = Math.max(...c.map((r) => Date.parse(r.peak.time)));
    // Every sensor's rise over the event, including ones that barely moved (uneven watering).
    const rises = sensors
      .map((s) => {
        const before = valueAt(smooth(s.points), start);
        const top = smooth(s.points).filter((p) => Date.parse(p.time) >= start && Date.parse(p.time) <= peak + 6 * HOUR);
        if (before === null || !top.length) return null;
        return { sensorId: s.sensorId, sensorName: s.sensorName, rise: round1(Math.max(...top.map((p) => p.value)) - before), low: false };
      })
      .filter((r): r is SensorRise => r !== null);
    const typical = median(rises.map((r) => r.rise));
    if (rises.length >= 2) for (const r of rises) r.low = r.rise < 0.4 * typical;

    const rainMm = round1(
      weather.filter((w) => Date.parse(w.time) >= start - 6 * HOUR && Date.parse(w.time) <= peak).reduce((s, w) => s + w.rainMm, 0),
    );
    let detected: 'rain' | 'irrigation' = 'irrigation';
    let confidence: 'high' | 'low' = 'high';
    if (rainMm >= 2 && typical <= 2.5 * rainMm * POINTS_PER_MM) detected = 'rain';
    else if (rainMm >= 1) confidence = 'low'; // some rain, but far less than the rise: probably watered too

    const farmer = fb.find((f) => Math.abs(f.t - start) <= FEEDBACK_MATCH_HOURS * HOUR);
    return {
      start: new Date(start).toISOString(),
      peak: new Date(peak).toISOString(),
      label: farmer ? farmer.label : detected,
      detected,
      source: farmer ? 'farmer' : 'detected',
      confidence: farmer ? 'high' : confidence,
      rainMm,
      rises,
    };
  });
}

/** The latest event the farmer watered (R-023 "last watered"), or null. */
export const lastWatered = (events: WettingEvent[]) => events.filter((e) => e.label === 'irrigation').at(-1)?.start ?? null;
