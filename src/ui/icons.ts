import { CC, POLY, WS } from '../seed/farm';
import type { Crop, FieldId, WaterState } from '../types';

export const polyPoints = (id: FieldId): [number, number][] =>
  POLY[id].split(' ').map((s) => s.split(',').map(Number) as [number, number]);

const CAN_GLYPH: Record<WaterState, string> = {
  now: `<path d='M22 17.5c1.4 1.8 2.2 2.8 2.2 3.8a2.2 2.2 0 0 1-4.4 0c0-1 .8-2 2.2-3.8z' fill='#fff'/>`,
  soon: `<path d='M22 18v3.2l2 1.3' stroke='#fff' stroke-width='1.4' fill='none' stroke-linecap='round'/>`,
  rain: `<path d='M19.5 21.5a2 2 0 0 1 .6-3.9 3 3 0 0 1 5.6 1 1.6 1.6 0 0 1-.4 2.9z' fill='#fff'/>`,
  none: `<path d='M19.3 21l2 2 3.6-4' stroke='#fff' stroke-width='1.8' fill='none' stroke-linecap='round'/>`,
};

/** Watering-can glyph body, without the outer <svg>. */
export const canIn = (k: WaterState, col?: string) => {
  const h = WS[k].h;
  const b = col || h;
  return `<path d='M6 11h10v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z' fill='${b}'/><path d='M6 13H4.5a2 2 0 0 0 0 4H6M8 11c0-4 6-4 6 0' stroke='${b}' stroke-width='2' fill='none'/><path d='M16 14l6-5' stroke='${b}' stroke-width='2.5' stroke-linecap='round'/><path d='M21 6.5l3 3' stroke='${b}' stroke-width='3' stroke-linecap='round'/><circle cx='22' cy='21' r='6' fill='${h}' stroke='#fff' stroke-width='1.5'/>${CAN_GLYPH[k]}`;
};

export const can = (k: WaterState, s = 28, col?: string) =>
  `<svg viewBox='0 0 28 28' width='${s}' height='${s}' role=img aria-label='${WS[k].t}' style='flex:none'>${canIn(k, col)}</svg>`;

const ic = (p: string) =>
  `<svg viewBox='0 0 24 24' width=20 height=20 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round>${p}</svg>`;

export const IC: Partial<Record<string, string>> = {
  dashboard: ic(`<circle cx=12 cy=9 r=3.5 /><path d='M3 19c4-4 14-4 18 0M12 2v1.5M4.5 5l1 1M19.5 5l-1 1'/>`),
  map: ic(`<path d='M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14'/>`),
  field: ic(`<path d='M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2.5-5 6-5 0 3-2.5 5-6 5z'/>`),
  sensors: ic(`<path d='M12 3v11M9 14h6l-1 7h-4zM6 8c1.5-1.5 3-2 6-2s4.5.5 6 2'/>`),
  weather: ic(`<path d='M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.5 1.5A3.3 3.3 0 0 1 17 18z'/>`),
  recs: can('now', 22, 'currentColor'),
  alerts: ic(`<path d='M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4'/>`),
  settings: ic(`<path d='M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6'/>`),
};

export const cropIn = (c: Crop) => {
  const k = CC[c];
  const grain = `<ellipse cx=12 cy=6 rx=2.2 ry=3.6 fill=${k} /><ellipse cx=8.4 cy=9.5 rx=2 ry=3.2 fill=${k} transform='rotate(-28 8.4 9.5)' /><ellipse cx=15.6 cy=9.5 rx=2 ry=3.2 fill=${k} transform='rotate(28 15.6 9.5)' />`;
  const dots = `<circle cx=12 cy=6 r=3 fill=${k} /><circle cx=8 cy=9.5 r=2.6 fill=${k} /><circle cx=16 cy=9.5 r=2.6 fill=${k} />`;
  const pod = `<path d='M7 4c5 0 8 3 8 8-5 0-8-3-8-8z' fill=${k} />`;
  const head: Record<Crop, string> = { Wheat: grain, Barley: grain, Oats: grain, Canola: dots, Alfalfa: dots, Peas: pod };
  return `<path d='M12 22V10M12 18c-4 0-6-2-6-5 4 0 6 2 6 5zM12 15c4 0 6-2 6-5-4 0-6 2-6 5z' stroke=#2f6b3b stroke-width=1.6 fill=#4a9a55 stroke-linejoin=round />${head[c]}`;
};

export const cropG = (c: Crop, s = 28) =>
  `<svg viewBox='0 0 24 24' width=${s} height=${s} style='vertical-align:middle' aria-hidden=true>${cropIn(c)}</svg>`;

export const plants = (id: FieldId, c: Crop) => {
  const p = polyPoints(id);
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const x0 = Math.min(...xs) + 26;
  const x1 = Math.max(...xs) - 26;
  const y0 = Math.min(...ys) + 10;
  const y1 = Math.max(...ys) - 30;
  let o = '';
  for (let X = x0; X < x1; X += 34) {
    o += `<g transform='translate(${X} ${y0})'>${cropIn(c)}</g><g transform='translate(${X} ${y1})'>${cropIn(c)}</g>`;
  }
  return o;
};

export const fieldNumberLabel = (id: FieldId) => {
  const p = polyPoints(id);
  return `<text x='${Math.min(...p.map((q) => q[0])) + 12}' y='${Math.min(...p.map((q) => q[1])) + 74}' font-size='80' font-weight='800' font-family='DM Serif Display,Georgia,serif' fill='#fff' fill-opacity='.3' pointer-events='none'>0${'ABCDEF'.indexOf(id) + 1}</text>`;
};
