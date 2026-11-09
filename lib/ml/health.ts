// R-022: which soil-moisture sensors to trust. Simple, explainable rules, not a trained model:
// a broken probe fails in a few recognisable ways, and the farmer needs the reason in plain words.
//
//   faulty (left out of watering advice): stuck on one value for a day, a value soil cannot hold,
//                                         or a sharp jump with no rain that falls straight back
//   check  (still counted):               reads far from the field's other sensors (could be a real
//                                         dry patch, such as a blocked emitter, so the farmer looks)
import { HOUR, median, round1, type SensorSeries, type WeatherHour } from './types';

export type HealthStatus = 'ok' | 'check' | 'faulty';
export interface SensorHealth {
  sensorId: string;
  sensorName: string;
  status: HealthStatus;
  reason: string | null;
}

const STUCK_HOURS = 24;
const MIN_POSSIBLE = 1;
const MAX_POSSIBLE = 70; // mineral soils saturate well below this
const SPIKE_POINTS = 15;
const SPIKE_WINDOW_HOURS = 24;
const DISAGREE_POINTS = 8;

const hourLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', timeZone: 'UTC', hour12: true });

function rainNear(weather: WeatherHour[], time: string, hours: number): number {
  const t = Date.parse(time);
  return weather.filter((w) => Math.abs(Date.parse(w.time) - t) <= hours * HOUR).reduce((s, w) => s + w.rainMm, 0);
}

function faultOf(s: SensorSeries, weather: WeatherHour[], now: Date): string | null {
  const pts = s.points;
  const last = pts.at(-1);
  if (!last) return null; // no readings: the stale rule (R-015) already covers it
  if (last.value < MIN_POSSIBLE || last.value > MAX_POSSIBLE) return `reads ${last.value}%, which soil cannot hold`;

  const day = pts.filter((p) => Date.parse(p.time) > now.getTime() - STUCK_HOURS * HOUR);
  if (day.length >= STUCK_HOURS - 4) {
    const vs = day.map((p) => p.value);
    if (Math.max(...vs) - Math.min(...vs) < 0.05) return `has read exactly ${last.value}% since ${hourLabel(day[0].time)}`;
  }

  // A spike: up by SPIKE_POINTS from the hour before, back within 3 points of it within 6 hours, no rain.
  const recent = pts.filter((p) => Date.parse(p.time) > now.getTime() - SPIKE_WINDOW_HOURS * HOUR);
  for (let i = 1; i < recent.length; i++) {
    const before = recent[i - 1].value;
    if (recent[i].value - before < SPIKE_POINTS) continue;
    const back = recent.slice(i + 1, i + 7).some((p) => Math.abs(p.value - before) <= 3);
    if (back && rainNear(weather, recent[i].time, 3) < 1) return `jumped to ${recent[i].value}% at ${hourLabel(recent[i].time)} with no rain`;
  }
  return null;
}

const dayMean = (s: SensorSeries, now: Date) => {
  const vs = s.points.filter((p) => Date.parse(p.time) > now.getTime() - 24 * HOUR).map((p) => p.value);
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN;
};

export function sensorHealth(sensors: SensorSeries[], weather: WeatherHour[], now: Date): SensorHealth[] {
  const out: SensorHealth[] = sensors.map((s) => {
    const fault = faultOf(s, weather, now);
    return { sensorId: s.sensorId, sensorName: s.sensorName, status: fault ? 'faulty' : 'ok', reason: fault };
  });
  // Disagreement needs at least two other trusted sensors to compare with; with two in all, we can't tell which is off.
  const means = new Map(sensors.map((s) => [s.sensorId, dayMean(s, now)]));
  const trusted = out.filter((h) => h.status === 'ok' && Number.isFinite(means.get(h.sensorId)!));
  if (trusted.length < 3) return out;
  for (const h of trusted) {
    const others = trusted.filter((o) => o !== h).map((o) => means.get(o.sensorId)!);
    const gap = means.get(h.sensorId)! - median(others);
    if (Math.abs(gap) >= DISAGREE_POINTS) {
      h.status = 'check';
      h.reason = `reads ${round1(Math.abs(gap))} points ${gap < 0 ? 'drier' : 'wetter'} than the field's other sensors`;
    }
  }
  return out;
}
