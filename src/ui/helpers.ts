import { HL, MET, WS } from '../seed/farm';
import { AL, F, ownsSeedRef } from '../seed/simulate';
import { S } from '../state';
import type { Field, FieldId, Level, Metric, MetricKey, Range, StationKey, WaterState } from '../types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export const pill = (k: Level) => `<span class="pill ${k}">${HL[k][1]} ${HL[k][0]}</span>`;

export const T = (c: number) => (S.units === '°F' ? Math.round((c * 9) / 5 + 32) + '°F' : c + '°C');

/** What on this page is simulated. Signed in, only the sensors are: the weather is the farm's live forecast. */
export const demo = () =>
  S.liveWeather?.simulated
    ? '<div class="demo">Demo farm: the sensor readings and this farm’s weather (a dry spell) are simulated, so every situation shows. No real probes are connected yet.</div>'
    : S.farmerId
    ? '<div class="demo">Demo farm: the sensor readings are simulated, since no real probes are connected yet. The weather is the live forecast for this farm.</div>'
    : '<div class="demo">Demo data: every reading, forecast and alert here is simulated. No real sensors or weather service are connected.</div>';

export function rng(v: number, r: Range): string {
  const span = r[1] * 1.4 - r[0] * 0.5;
  const p = Math.max(0, Math.min(100, ((v - r[0] * 0.5) / span) * 100));
  const a = ((r[0] - r[0] * 0.5) / span) * 100;
  const b = ((r[1] - r[0] * 0.5) / span) * 100;
  return `<div class="bar"><i style="left:${a}%;width:${b - a}%"></i><b style="left:${p}%"></b></div>`;
}

export const mix = (a: number[], b: number[], t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k))})`;
};

/**
 * Signed in, a field shows its live readings or nothing: the seed's made-up numbers must never stand in
 * for a real farm, not even for the seconds before the first load (they would say the wrong field needs water).
 */
export const pending = (f: Field) => !!S.farmerId && !S.liveFields.includes(f.id);
/** Any field of a signed-in farm still waiting for its first live load. */
export const liveLoading = () => F.some(pending);
/**
 * Why a field has no advice to show: still loading, or the load came back without it (a failed call).
 * Never "loading" once the load is over, so a failure can't read as a wait that never ends.
 */
export const noAdviceText = (f: Field) =>
  pending(f) ? 'Loading advice…' : 'Couldn’t load advice for this field. Reload the page to try again.';
/** Why there is no forecast: still loading, the load failed, or (signed out) there is no farm to forecast for. */
export const noWeatherText = () =>
  !S.farmerId ? 'Sign in to see your farm’s forecast.' : liveLoading() ? 'Loading forecast…' : 'Couldn’t load the forecast right now.';
/**
 * Whether a field has a real reading of k. Signed out, the demo always does. Signed in, only a probe that
 * reported it counts: a field's starting values are the demo simulator's, so a field with no probes (one
 * just added) or a quantity no probe measures (EC, air temperature, sunlight) has nothing to show.
 */
export const hasReading = (f: Field, k: MetricKey): boolean => {
  if (!S.farmerId) return true;
  if (k === 'm' || k === 'st' || k === 'ph' || k === 'h') return !!S.liveSensors[f.id]?.some((s) => s[k] != null);
  return false;
};
/** Soil moisture for small spaces: "34%", or a dash while the field has no reading. */
export const mText = (f: Field) => (hasReading(f, 'm') ? `${f.m}%` : '—');
/** A skeleton bar where a number will be. */
export const SK = '<i class=sk aria-hidden=true></i>';

export const ws = (f: Field): WaterState => {
  if (pending(f)) return 'load';
  const a = S.liveAdvice[f.id];
  if (a) {
    if (a.status === 'water_today' || a.label === 'Water today') return 'now';
    // No fresh reading, or every probe faulty: say so, never a watering call made without data.
    if (a.status === 'no_recent_reading' || a.status === 'check_sensors') return 'check';
    if (a.status === 'wait' || a.label === 'Wait') {
      return /rain/i.test(a.reason) ? 'rain' : 'none';
    }
    // rain_fed, not_configured: no watering prompt. With live advice, never fall back
    // to the seed's crop range below (a rain-fed field must never look like it needs water; R-021).
    return 'none';
  }
  // Signed in, loaded, and no advice came back (a failed or timed-out call): say so. The guess below is
  // the signed-out demo's, run on made-up numbers; it must never tell a real farm to water.
  if (S.farmerId) return 'err';
  const lo = f.mi[0];
  if (f.m < lo) return f.m >= lo - 3 ? 'rain' : 'now';
  return f.stMax > 20 || f.m < lo + 4 ? 'soon' : 'none';
};

/**
 * What to do with a field, in a few words: the headline wherever a field's state is shown, so the map,
 * the cards and the field page always use the same words. Signed in, that is the server's label (the
 * SPEC's own words, R-009: Water today, Wait, No recent reading, Check sensors, Not configured,
 * Rain-fed); the signed-out demo uses the map key's words.
 */
export function decision(f: Field): string {
  const k = ws(f);
  if (k === 'load') return WS.load.t;
  return S.liveAdvice[f.id]?.label ?? WS[k].t;
}

/** The farm in one or two sentences: which fields need the farmer today, or that none do. */
export function farmVerdict(): string {
  const named = (k: WaterState) => F.filter((f) => ws(f) === k).map((f) => f.name);
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  const water = named('now');
  const check = named('check');
  const parts = [water.length ? `Water ${list(water)} today.` : '', check.length ? `Check the sensors in ${list(check)}.` : ''].filter(Boolean);
  if (!parts.length) return 'All fields are fine today. Nothing to do.';
  return water.length + check.length < F.length ? `${parts.join(' ')} The rest are fine.` : parts.join(' ');
}

export const metric = (k: MetricKey): Metric => MET.find((m) => m.key === k) ?? MET[0];
export const idealRange = (f: Field, m: Metric): Range => (m.key === 'ph' && f.phr) || m.range || f.mi;
export const isStation = (k: MetricKey): k is StationKey => k === 'at' || k === 'h' || k === 'l';
export const fieldNo = (id: FieldId) => {
  const ix = F.findIndex((f) => f.id === id);
  if (ix >= 0) return String(ix + 1).padStart(2, '0');
  const field = F.find((f) => f.id === id);
  if (field) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const i = letters.indexOf(field.layout);
    if (i >= 0) return String(i + 1).padStart(2, '0');
  }
  return id.length <= 3 ? id : String(Math.max(1, ix + 1)).padStart(2, '0');
};

/** "Last watered" as the field page words it: the latest detected irrigation (R-023), or none. */
export const wateredText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }) : 'None in the last 14 days';

/** Last watered, everywhere the same: signed in, from the detected events; the signed-out demo keeps its own log. */
export const lastWatered = (id: FieldId) => {
  const a = S.liveAdvice[id];
  if (a) return wateredText(a.lastWatered);
  if (S.farmerId) return '—';
  const e = S.log.find((x) => x.f === id);
  return e ? `${e.d} · ${e.mm} mm` : 'Not this week';
};

/** Dry soil is brown, wet soil is blue — used for per-area moisture on the map. */
export const moistureTint = (m: number) => mix([176, 86, 42], [55, 118, 168], Math.max(0, Math.min(1, (m - 14) / 34)));

/** Alerts for this farmer's fields, plus farm-wide weather notices. */
export const openAlerts = () => {
  if (S.farmerId) {
    return S.liveAlerts.map((a, i) => ({
      id: i + 1,
      l: 'wn' as const,
      t: 'Watering alert',
      f: a.fieldId,
      d: esc(a.message), // holds farmer-typed sensor names; every view inserts d as HTML
      ago: new Date(a.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric' }),
    }));
  }
  return AL.filter((a) => !S.dis[a.id] && a.l !== 'in' && ownsSeedRef(a.f));
};

export const firstName = () => S.name.split(' ')[0] ?? '';
export const initials = () =>
  S.name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();