import { DN, HOD, RAIN, RT, SEN } from '../seed/simulate';
import { S } from '../state';
import type { Field, MetricKey } from '../types';
import { esc, idealRange, isStation, metric, ws } from './helpers';
import { canIn, cropIn } from './icons';

export const SERIES_COLORS = ['#232a33', '#4a78b5', '#cf7f3a', '#6f9a7c'];

interface Line {
  id: string;
  v: (number | null)[];
  gl: Set<number>;
  age: number;
}

/** Seven-day line chart for one metric: one line per sensor (or the weather station). */
export function chart(f: Field, k: MetricKey): string {
  const met = metric(k);
  const rg = idealRange(f, met);
  const hist = S.liveHistory[f.id];  let lines: Line[];
  let rain: number[];
  let n: number;
  let dayLabel: (i: number) => string;
  let rainTotal: number;

  if (hist?.sensors.length) {
    n = hist.hours.length;
    rain = hist.rain;
    rainTotal = Math.round(rain.reduce((a, b) => a + b, 0) * 10) / 10;
    dayLabel = (i) => {
      const d = new Date(hist.hours[i] + ':00:00.000Z');
      return d.toLocaleDateString('en', { weekday: 'short' });
    };
    if (isStation(k)) {
      const arr: (number | null)[] = Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        const vals = hist.sensors.map((s) => s.vals[k]?.[i]).filter((v): v is number => v != null);
        arr[i] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }
      lines = [{ id: 'Field avg', v: arr, gl: new Set(), age: 0 }];
    } else {
      lines = hist.sensors.map((s) => ({
        id: s.name,
        v: s.vals[k] ?? Array(n).fill(null),
        gl: new Set(),
        age: s.ageHours,
      }));
    }
  } else if (S.farmerId) {
    n = 168;
    rain = Array(168).fill(0);
    rainTotal = 0;
    dayLabel = (i) => DN(i);
    lines = [];
  } else {
    n = 168;
    rain = RAIN;
    rainTotal = RT;
    dayLabel = (i) => DN(i);
    lines = isStation(k)
      ? [{ id: 'Station', v: f.stn[k], gl: new Set(), age: 0 }]
      : SEN.filter((x) => x.f === f.layout).map((x) => ({ id: x.id, v: x.vals[k], gl: x.gl[k], age: x.age }));
  }

  const all = lines.flatMap((l) => l.v.filter((x, i): x is number => x != null && !l.gl.has(i)));
  if (!all.length) {
    return `<svg viewBox='0 0 640 236' style='width:100%;height:auto' role=img aria-label='${esc(met.name)}, last 7 days'><text x=320 y=120 text-anchor=middle fill=#5b6470 font-size=14>No readings for this metric yet</text></svg>`;
  }
  // Soil moisture with live advice: the farmer's trigger is the line to watch, not the crop's range.
  const advice = k === 'm' ? S.liveAdvice[f.id] : undefined;
  const trig = advice?.setup.irrigated ? (advice.setup.trigger?.value ?? null) : null;
  const marks = advice ? (trig != null ? [trig] : []) : rg;
  let lo = Math.min(...all, ...marks);
  let hi = Math.max(...all, ...marks);
  const temp = k === 'at' || k === 'st';
  if (temp) lo = Math.min(lo, 0);
  const pad = (hi - lo) * 0.1 || 1;
  lo -= pad;
  hi += pad;
  const span = Math.max(1, n - 1);
  const X = (i: number) => 44 + i * (586 / span);
  const Y = (v: number) => 200 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 180;

  let o = `<svg viewBox='0 0 640 236' style='width:100%;height:auto' role=img aria-label='${esc(met.name)}, last 7 days'>`;
  rain.forEach((q, i) => {
    if (q > 0) o += `<rect x=${X(i) - 2} y=20 width=4 height=180 fill=#5b8ec9 fill-opacity=.3 />`;
  });
  if (!advice) {
    o += `<rect x=44 y=${Y(rg[1])} width=586 height=${Y(rg[0]) - Y(rg[1])} fill=#6f9a7c fill-opacity=.2 /><text x=40 y=${Y(rg[1]) + 4} text-anchor=end font-size=10 fill=#5b6470>${rg[1]}</text><text x=40 y=${Y(rg[0]) + 4} text-anchor=end font-size=10 fill=#5b6470>${rg[0]}</text>`;
  } else if (trig != null) {
    o += `<path d='M44 ${Y(trig)}H630' stroke=#c0522b stroke-width=1.5 stroke-dasharray='6 4' /><text x=40 y=${Y(trig) + 4} text-anchor=end font-size=10 fill=#c0522b>${trig}</text><text x=626 y=${Y(trig) - 5} text-anchor=end font-size=10 fill=#c0522b>your trigger</text>`;
  }
  if (temp && lo < 0) {
    o += `<path d='M44 ${Y(0)}H630' stroke=#5b8ec9 stroke-dasharray='4 4' /><text x=40 y=${Y(0) + 4} text-anchor=end font-size=10 fill=#4a78b5>0</text>`;
  }
  let lastDay = '';
  for (let i = 0; i < n; i++) {
    const label = dayLabel(i);
    // Hour keys are UTC; the day lines and their labels follow the farmer's own clock.
    const isMidnight = hist ? new Date(hist.hours[i] + ':00:00.000Z').getHours() === 0 : HOD(i) === 0;
    if (isMidnight || (hist && label !== lastDay && i % 24 === 0)) {
      o += `<path d='M${X(i)} 20V200' stroke=#d9d0bd /><text x=${X(i) + 3} y=216 font-size=10 fill=#5b6470>${label}</text>`;
      lastDay = label;
    }
  }
  if (rain.length) o += `<text x=${X(Math.floor(n * 0.38))} y=14 text-anchor=middle font-size=10 fill=#3d5f8f>Rain ${rainTotal} mm</text>`;
  lines.forEach((l, j) => {
    let d = '';
    let on = false;
    l.v.forEach((x, i) => {
      if (x == null) {
        on = false;
        return;
      }
      if (l.gl.has(i)) return;
      d += (on ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1);
      on = true;
    });
    o += `<path d='${d}' fill=none stroke='${SERIES_COLORS[j % 4]}' stroke-width=2 stroke-linejoin=round />`;
    if (l.age > 6) {
      o += `<text x=${Math.min(590, X(Math.max(0, n - 1 - Math.min(n - 1, l.age))))} y=231 text-anchor=middle font-size=10 fill=#c0583f>${esc(l.id)} last reading</text>`;
    }
  });
  return o + '</svg>';
}

/** Soil cross-section showing the moisture line against the crop's ideal band. */
export function soil(f: Field): string {
  const k = ws(f);
  const [lo, hi] = f.mi;
  const y = (v: number) => 110 + (v / 60) * 230;
  const live = S.liveAdvice[f.id];
  const trig = live?.setup.irrigated ? (live.setup.trigger?.value ?? null) : null;
  const marks = live
    ? trig != null
      ? `<path d='M0 ${y(trig)}H290' stroke=#f0d6a0 stroke-width=2 stroke-dasharray='8 6' /><text x=200 y=${y(trig) + 16} font-size=12 font-weight=800 fill=#f0d6a0>TRIGGER ${trig}%</text>`
      : ''
    : `<rect x=0 y=${y(lo)} width=10 height=${y(hi) - y(lo)} fill=#f0d6a0 /><path d='M0 ${y(lo)}H290M0 ${y(hi)}H290' stroke=#f0d6a0 stroke-width=2 stroke-dasharray='8 6' /><text x=222 y=${y(lo) + 16} font-size=12 font-weight=800 fill=#f0d6a0>MIN ${lo}%</text><text x=222 y=${y(hi) - 6} font-size=12 font-weight=800 fill=#f0d6a0>MAX ${hi}%</text>`;
  const d = y(f.m);
  const roots = [30, 90, 150]
    .map(
      (x) =>
        `<g transform='translate(${x - 24} 66) scale(2)'>${cropIn(f.crop)}</g><path d='M${x} 110v50M${x} 125l-14 22M${x} 125l14 28M${x} 150l-8 30' stroke=#e8d9b0 stroke-width=2 fill=none stroke-linecap=round />`,
    )
    .join('');
  const canArt = k === 'now' || k === 'soon' ? `<g transform='translate(176 -2) rotate(-8 100 40) scale(4)'>${canIn(k)}</g>` : '';
  const drops =
    k === 'now'
      ? [0, 1, 2]
          .map(
            (i) =>
              `<path d='M0 0c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z' fill=#5b8ec9 transform='translate(${286 + i * 3} ${58 + i * 18}) scale(.9)' />`,
          )
          .join('')
      : '';
  return `<svg viewBox='0 0 320 340' style='width:100%;height:100%;display:block' preserveAspectRatio='xMaxYMid slice' role=img aria-label='Soil moisture cross-section for ${esc(f.name)}: ${f.m}%'><rect width=320 height=110 fill=#bfe3f2 /><circle cx=60 cy=36 r=20 fill=#f2c14e /><rect y=110 width=320 height=60 fill=#6b4423 /><rect y=170 width=320 height=70 fill=#523319 /><rect y=240 width=320 height=100 fill=#3b2411 /><path d='M0 110H320V${d}Q280 ${d + 10} 240 ${d}T160 ${d}T80 ${d}T0 ${d}z' fill=#5b8ec9 fill-opacity=.6 />${roots}${marks}<path d='M320 ${d - 14}L284 ${d}L320 ${d + 14}z' fill=#fff /><text x=316 y=${d + 4} text-anchor=end font-size=12 font-weight=800 fill=#222a33>${f.m}</text>${canArt}${drops}</svg>`;
}
