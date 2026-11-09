// R-025: when will the driest trusted sensor reach the trigger?
//
// fitDrying learns how fast this sensor's soil dries, from its own history (self-supervised: the
// "answer" is simply the next reading). Over 6-hour blocks with no rain and no recent wetting:
//
//   moisture lost = k × ET0 + c × hours        (least squares; k, c ≥ 0)
//
// waterBy then walks the forecast hour by hour (ET0 dries, rain wets) to the first hour at or below
// the trigger, and gives a window from the fit's spread rather than a falsely exact time.
import type { WettingEvent } from './events';
import { HOUR, type ForecastHour, type Point, type WeatherHour } from './types';

export interface DryingFit {
  k: number; // points lost per mm of ET0
  c: number; // points lost per hour regardless of weather (draining)
  spread: number; // relative error, 0.15 to 0.6
  blocks: number;
}
export interface WaterBy {
  earliest: string;
  latest: string;
  ifNoRain: string | null; // earlier date if the forecast rain does not come
}
export type WaterByResult =
  | { kind: 'window'; window: WaterBy }
  | { kind: 'now' } // already at or below the trigger
  | { kind: 'beyond'; days: number } // not within the forecast
  | { kind: 'learning'; needs: string };

const BLOCK = 6;
const MIN_BLOCKS = 4; // a day of usable data
const POINTS_PER_MM_RAIN = 1;

export function fitDrying(points: Point[], weather: WeatherHour[], events: WettingEvent[]): DryingFit | null {
  const byHour = new Map(points.map((p) => [Math.floor(Date.parse(p.time) / HOUR), p.value]));
  const wx = new Map(weather.map((w) => [Math.floor(Date.parse(w.time) / HOUR), w]));
  const blocked = events.map((e) => [Date.parse(e.start) / HOUR - 3, Date.parse(e.peak) / HOUR + 24]);
  const hours = [...byHour.keys()].sort((a, b) => a - b);
  const rows: { et0: number; loss: number }[] = [];
  for (const h of hours) {
    const end = h + BLOCK;
    if (!byHour.has(end)) continue;
    if (blocked.some(([a, b]) => end >= a && h <= b)) continue;
    let et0 = 0;
    let rain = 0;
    let complete = true;
    for (let x = h + 1; x <= end; x++) {
      const w = wx.get(x);
      if (!w) complete = false;
      else {
        et0 += w.et0Mm;
        rain += w.rainMm;
      }
    }
    if (!complete || rain > 0.2) continue;
    rows.push({ et0, loss: byHour.get(h)! - byHour.get(end)! });
  }
  if (rows.length < MIN_BLOCKS) return null;

  // Least squares for loss = k·et0 + c·BLOCK. If ET0 barely varies, k and c can't be told apart:
  // then all drying goes to c.
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.et0, 0) / n;
  const my = rows.reduce((s, r) => s + r.loss, 0) / n;
  const sxx = rows.reduce((s, r) => s + (r.et0 - mx) ** 2, 0);
  let k = sxx > 1e-6 * n ? rows.reduce((s, r) => s + (r.et0 - mx) * (r.loss - my), 0) / sxx : 0;
  let c = (my - k * mx) / BLOCK;
  if (k < 0) {
    k = 0;
    c = my / BLOCK;
  }
  if (c < 0) {
    c = 0;
    k = mx > 0 ? my / mx : 0;
  }
  const resid = Math.sqrt(rows.reduce((s, r) => s + (r.loss - (k * r.et0 + c * BLOCK)) ** 2, 0) / n);
  const spread = my > 0 ? Math.min(0.6, Math.max(0.15, resid / my)) : 0.6;
  return { k, c, spread, blocks: n };
}

function crossing(start: number, trigger: number, fit: DryingFit, outlook: ForecastHour[], scale: number, withRain: boolean): string | null {
  let v = start;
  for (const h of outlook) {
    v -= scale * (fit.k * h.et0Mm + fit.c);
    if (withRain) v += h.rainMm * POINTS_PER_MM_RAIN;
    if (v <= trigger + 1e-9) return h.time; // tolerate float drift on exact crossings
  }
  return null;
}

export function waterBy(current: number, trigger: number, fit: DryingFit | null, outlook: ForecastHour[]): WaterByResult {
  if (current <= trigger) return { kind: 'now' };
  if (!fit) return { kind: 'learning', needs: 'a day of readings without rain or watering, to learn how fast this soil dries' };
  const days = Math.round(outlook.length / 24);
  const expected = crossing(current, trigger, fit, outlook, 1, true);
  if (!expected) return { kind: 'beyond', days };
  const earliest = crossing(current, trigger, fit, outlook, 1 + fit.spread, true) ?? expected;
  const latest = crossing(current, trigger, fit, outlook, 1 - fit.spread, true) ?? outlook.at(-1)!.time;
  const dry = crossing(current, trigger, fit, outlook, 1, false);
  const ifNoRain = dry && Date.parse(expected) - Date.parse(dry) >= 12 * HOUR ? dry : null;
  return { kind: 'window', window: { earliest, latest, ifNoRain } };
}
