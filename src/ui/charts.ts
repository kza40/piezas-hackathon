import { DN, HOD, RAIN, RT, SEN } from '../seed/simulate';
import type { Field, MetricKey } from '../types';
import { idealRange, isStation, metric, ws } from './helpers';
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
  const lines: Line[] = isStation(k)
    ? [{ id: 'Station', v: f.stn[k], gl: new Set(), age: 0 }]
    : SEN.filter((x) => x.f === f.id).map((x) => ({ id: x.id, v: x.vals[k], gl: x.gl[k], age: x.age }));
  const all = lines.flatMap((l) => l.v.filter((x, i): x is number => x != null && !l.gl.has(i)));
  let lo = Math.min(...all, rg[0]);
  let hi = Math.max(...all, rg[1]);
  const temp = k === 'at' || k === 'st';
  if (temp) lo = Math.min(lo, 0);
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const X = (i: number) => 44 + i * (586 / 167);
  const Y = (v: number) => 200 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 180;

  let o = `<svg viewBox='0 0 640 236' style='width:100%;height:auto' role=img aria-label='${met.name}, last 7 days'>`;
  RAIN.forEach((q, i) => {
    if (q > 0) o += `<rect x=${X(i) - 2} y=20 width=4 height=180 fill=#5b8ec9 fill-opacity=.3 />`;
  });
  o += `<rect x=44 y=${Y(rg[1])} width=586 height=${Y(rg[0]) - Y(rg[1])} fill=#6f9a7c fill-opacity=.2 /><text x=40 y=${Y(rg[1]) + 4} text-anchor=end font-size=10 fill=#5b6470>${rg[1]}</text><text x=40 y=${Y(rg[0]) + 4} text-anchor=end font-size=10 fill=#5b6470>${rg[0]}</text>`;
  if (temp && lo < 0) {
    o += `<path d='M44 ${Y(0)}H630' stroke=#5b8ec9 stroke-dasharray='4 4' /><text x=40 y=${Y(0) + 4} text-anchor=end font-size=10 fill=#4a78b5>0</text>`;
  }
  for (let i = 0; i < 168; i++) {
    if (HOD(i) === 0) o += `<path d='M${X(i)} 20V200' stroke=#d9d0bd /><text x=${X(i) + 3} y=216 font-size=10 fill=#5b6470>${DN(i)}</text>`;
  }
  o += `<text x=${X(64)} y=14 text-anchor=middle font-size=10 fill=#3d5f8f>Rain ${RT} mm</text>`;
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
    l.v.forEach((x, i) => {
      if (x != null && l.gl.has(i)) {
        o += `<circle cx=${X(i)} cy=${Y(x)} r=5 fill=#c0583f stroke=#fff stroke-width=1.5><title>Odd reading ${x}, ignored</title></circle>`;
      }
    });
    if (l.age > 6) {
      o += `<text x=${Math.min(590, X(167 - l.age))} y=231 text-anchor=middle font-size=10 fill=#c0583f>${l.id} last reading</text>`;
    }
  });
  return o + '</svg>';
}

/** Soil cross-section showing the moisture line against the crop's ideal band. */
export function soil(f: Field): string {
  const k = ws(f);
  const [lo, hi] = f.mi;
  const y = (v: number) => 110 + (v / 60) * 230;
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
  return `<svg viewBox='0 0 320 340' style='width:100%;height:100%;display:block' preserveAspectRatio='xMidYMid slice' role=img aria-label='Soil moisture cross-section for ${f.name}: ${f.m}%'><rect width=320 height=110 fill=#bfe3f2 /><circle cx=60 cy=36 r=20 fill=#f2c14e /><rect y=110 width=320 height=60 fill=#6b4423 /><rect y=170 width=320 height=70 fill=#523319 /><rect y=240 width=320 height=100 fill=#3b2411 /><path d='M0 110H320V${d}Q280 ${d + 10} 240 ${d}T160 ${d}T80 ${d}T0 ${d}z' fill=#5b8ec9 fill-opacity=.6 />${roots}<rect x=0 y=${y(lo)} width=10 height=${y(hi) - y(lo)} fill=#f0d6a0 /><path d='M0 ${y(lo)}H290M0 ${y(hi)}H290' stroke=#f0d6a0 stroke-width=2 stroke-dasharray='8 6' /><text x=222 y=${y(lo) + 16} font-size=12 font-weight=800 fill=#f0d6a0>MIN ${lo}%</text><text x=222 y=${y(hi) - 6} font-size=12 font-weight=800 fill=#f0d6a0>MAX ${hi}%</text><path d='M320 ${d - 14}L284 ${d}L320 ${d + 14}z' fill=#fff /><text x=316 y=${d + 4} text-anchor=end font-size=12 font-weight=800 fill=#222a33>${f.m}</text>${canArt}${drops}</svg>`;
}
