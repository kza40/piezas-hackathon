import { CC, POLY, WS } from '../seed/farm';
import { F, sensorsOf } from '../seed/simulate';
import { hasBoundary, PIN_XY, toMapXY } from '../geo';
import { SAT_H, SAT_W } from '../satCache';
import { S } from '../state';
import type { Crop, FieldId, WaterState } from '../types';
import { fieldNo } from './helpers';

/** Map outline key: server field id → seed layout letter when present. */
export const polyKey = (id: FieldId): FieldId => {
  const f = F.find((x) => x.id === id);
  const key = f?.layout ?? id;
  return POLY[key] ? key : id;
};

/**
 * A field's saved boundary in map units, placed around the farm pin. Null without a boundary or a farm location,
 * and for a boundary that reaches past the imagery (the farm was moved, say): drawn there it would be off the
 * map, out of the farmer's reach, so the field shows as a sketch parcel instead.
 */
const realOutline = (id: FieldId): [number, number][] | null => {
  const ring = F.find((x) => x.id === id)?.boundary;
  if (!hasBoundary(ring) || S.farmLat == null || S.farmLng == null) return null;
  const pin: [number, number] = [S.farmLng, S.farmLat];
  const pts = ring.map((p) => toMapXY(p, pin));
  const onMap = pts.every(([x, y]) => Math.abs(x - PIN_XY[0]) <= SAT_W / 2 && Math.abs(y - PIN_XY[1]) <= SAT_H / 2);
  return onMap ? pts : null;
};

/** Whether a field is drawn at its real place (from its boundary) rather than as a sketch parcel. */
export const drawnFromBoundary = (id: FieldId) => realOutline(id) != null;

/** A field's outline in map units, in both views: its real boundary when it has one, else its sketch parcel. */
export const polyPoints = (id: FieldId): [number, number][] =>
  realOutline(id) ?? (POLY[polyKey(id)] || '0,0 1,0 1,1').split(' ').map((s) => s.split(',').map(Number) as [number, number]);

/**
 * A field's sensors as placed on the map. Their spots are laid out for a sketch parcel (about 270×170 units), so on a
 * smaller field (a real boundary) they are pulled in towards its middle to stay inside it.
 */
export const sensorsOn = (id: FieldId) => {
  const ss = sensorsOf(id);
  const p = polyPoints(id);
  const span = (k: 0 | 1) => Math.max(...p.map((q) => q[k])) - Math.min(...p.map((q) => q[k]));
  const fit = Math.min(1, (span(0) * 0.32) / 70, (span(1) * 0.32) / 60);
  return fit === 1 ? ss : ss.map((s) => ({ ...s, dx: s.dx * fit, dy: s.dy * fit }));
};

/**
 * How far a field drawn at its real place may be dragged, in map units, as [[min dx, min dy], [max dx, max dy]]:
 * as far as keeps it on the imagery (past it, it would be drawn as a sketch parcel instead).
 */
export const realFieldRoom = (id: FieldId): [[number, number], [number, number]] => {
  const p = polyPoints(id);
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const [left, top] = [PIN_XY[0] - SAT_W / 2, PIN_XY[1] - SAT_H / 2];
  const [right, bottom] = [PIN_XY[0] + SAT_W / 2, PIN_XY[1] + SAT_H / 2];
  return [
    [left - Math.min(...xs), top - Math.min(...ys)],
    [right - Math.max(...xs), bottom - Math.max(...ys)],
  ];
};

/** How far the farmer dragged a sketch parcel. A field drawn at its real place is never moved. */
export const parcelOffset = (id: FieldId): [number, number] => (drawnFromBoundary(id) ? [0, 0] : (S.off[id] ?? [0, 0]));

/** The sketched irrigation pipes fit the standard sketch layout only. */
export const sketchPipesFit = () => Object.keys(S.off).length === 0 && !F.some((f) => drawnFromBoundary(f.id));

const CAN_GLYPH: Record<WaterState, string> = {
  now: `<path d='M22 17.5c1.4 1.8 2.2 2.8 2.2 3.8a2.2 2.2 0 0 1-4.4 0c0-1 .8-2 2.2-3.8z' fill='#fff'/>`,
  check: `<path d='M22 17.6v3.6' stroke='#fff' stroke-width='1.8' stroke-linecap='round'/><circle cx='22' cy='23.6' r='1' fill='#fff'/>`,
  soon: `<path d='M22 18v3.2l2 1.3' stroke='#fff' stroke-width='1.4' fill='none' stroke-linecap='round'/>`,
  rain: `<path d='M19.5 21.5a2 2 0 0 1 .6-3.9 3 3 0 0 1 5.6 1 1.6 1.6 0 0 1-.4 2.9z' fill='#fff'/>`,
  none: `<path d='M19.3 21l2 2 3.6-4' stroke='#fff' stroke-width='1.8' fill='none' stroke-linecap='round'/>`,
  load: `<circle cx='19.6' cy='21' r='1' fill='#fff'/><circle cx='22' cy='21' r='1' fill='#fff'/><circle cx='24.4' cy='21' r='1' fill='#fff'/>`,
  err: `<path d='M20.4 19.4a1.7 1.7 0 1 1 2.4 1.6c-.6.3-.8.6-.8 1.1' stroke='#fff' stroke-width='1.4' fill='none' stroke-linecap='round'/><circle cx='22' cy='23.9' r='.8' fill='#fff'/>`,
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
  const berries = `<circle cx=9 cy=7 r=2.6 fill=${k} /><circle cx=14.5 cy=6 r=2.6 fill=${k} /><circle cx=12 cy=10.5 r=2.6 fill=${k} /><circle cx=14.5 cy=5.4 r=.7 fill=#c9d3f5 /><circle cx=9 cy=6.4 r=.7 fill=#c9d3f5 />`;
  const head: Record<Crop, string> = { Wheat: grain, Barley: grain, Oats: grain, Canola: dots, Alfalfa: dots, Blueberries: berries };
  return `<path d='M12 22V10M12 18c-4 0-6-2-6-5 4 0 6 2 6 5zM12 15c4 0 6-2 6-5-4 0-6 2-6 5z' stroke=#2f6b3b stroke-width=1.6 fill=#4a9a55 stroke-linejoin=round />${head[c]}`;
};

export const cropG = (c: Crop, s = 28) =>
  `<svg viewBox='0 0 24 24' width=${s} height=${s} style='vertical-align:middle' aria-hidden=true>${cropIn(c)}</svg>`;

export const plants = (id: FieldId, c: Crop) => {
  const p = polyPoints(id);
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const row = c === 'Blueberries' ? 38 : 26;
  const col = c === 'Blueberries' ? 34 : 22;
  const x0 = Math.min(...xs) + 22;
  const x1 = Math.max(...xs) - 22;
  const y0 = Math.min(...ys) + 14;
  const y1 = Math.max(...ys) - 36;
  let o = '';
  for (let Y = y0, r = 0; Y < y1; Y += row, r++) {
    for (let X = x0 + (r % 2 ? col / 2 : 0); X < x1; X += col) {
      o += `<g transform='translate(${X} ${Y}) scale(0.72)'>${cropIn(c)}</g>`;
    }
  }
  return o;
};

export const fieldNumberLabel = (id: FieldId) => {
  const p = polyPoints(id);
  const label = fieldNo(id);
  return `<text x='${Math.min(...p.map((q) => q[0])) + 12}' y='${Math.min(...p.map((q) => q[1])) + 74}' font-size='80' font-weight='800' font-family='Fraunces,Georgia,serif' fill='#fff' fill-opacity='.3' pointer-events='none'>${label}</text>`;
};
