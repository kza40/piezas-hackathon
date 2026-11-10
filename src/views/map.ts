import { FB, HL, MEADOWS, POLY, RIDGES, SENSOR_XY, TREES, WS } from '../seed/farm';
import { F, sensorsOf } from '../seed/simulate';
import { S, saveOffsets } from '../state';
import type { Field, FieldId, Health, MapLayer } from '../types';
import { esc, lastWatered, mix, moistureTint, pending, T, ws } from '../ui/helpers';
import { canIn, fieldNumberLabel, plants, polyKey, polyPoints } from '../ui/icons';

const VIEW_W = 800;
const VIEW_H = 520;
export const SENSOR_OFFSETS = SENSOR_XY;
const HEALTH_FILL: Record<Health, string> = { ok: '#8fc47a', wn: '#f0c75a', cr: '#e07a63' };
const HEIGHT_MEANS: Record<MapLayer, string> = { water: 'needs water sooner', health: 'needs more attention', moisture: 'wetter soil', temp: 'warmer soil' };
const LAYERS: [MapLayer, string][] = [['water', 'Watering'], ['health', 'Health'], ['moisture', 'Moisture'], ['temp', 'Temp']];

export const center = (id: FieldId): [number, number] => {
  const p = polyPoints(id);
  return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
};

export const fillFor = (x: Field, layer: MapLayer) => {
  if (pending(x)) return FB.load.bg;
  if (layer === 'water') return FB[ws(x)].bg;
  if (layer === 'health') return HEALTH_FILL[x.hl];
  if (layer === 'moisture') return mix([207, 227, 238], [47, 120, 168], x.m / 55);
  return mix([246, 223, 176], [217, 130, 43], (x.st - 10) / 14);
};

export const valueFor = (x: Field, layer: MapLayer) => {
  if (pending(x)) return 'Loading…';
  if (layer === 'water') return WS[ws(x)].t;
  if (layer === 'health') return HL[x.hl][0];
  if (layer === 'moisture') return x.m + '% moisture';
  return T(x.st);
};

const fieldShape = (x: Field, layer: MapLayer) => {
  const [cx, cy] = center(x.id);
  const sel = S.sel === x.id;
  const posts = sensorsOf(x.id);
  const zones = posts
    .map((s) => {
      const fill = s.m == null ? '#ccc' : moistureTint(s.m);
      return `<circle class=fzone cx='${cx + s.dx}' cy='${cy + s.dy}' r='34' fill='${fill}' fill-opacity='0.28' pointer-events='none'/>`;
    })
    .join('');
  const sensors = posts
    .map((s) => {
      const label =
        s.m != null
          ? `<text class=fpin x='${cx + s.dx}' y='${cy + s.dy - 12}' text-anchor='middle' font-size='11' font-weight='800' fill='#1b2229'>${esc(s.id)} ${Math.round(s.m)}%</text>`
          : '';
      return `<circle cx='${cx + s.dx}' cy='${cy + s.dy}' r='6' fill='${s.online ? '#1f3d27' : '#fff'}' stroke='${s.online ? '#fff' : '#b97a00'}' stroke-width='${s.online ? 2 : 3}'/>${label}`;
    })
    .join('');
  const hud = `<g class=fhud pointer-events='none'><rect x='${cx - 92}' y='${cy + 64}' width='184' height='52' fill='#fffef8' stroke='#1b2229' stroke-width='1.5'/><text x='${cx}' y='${cy + 82}' text-anchor='middle' font-size='11' font-weight='800' fill='#1b2229'>Humidity ${x.h}% · ${T(x.st)}</text><text x='${cx}' y='${cy + 98}' text-anchor='middle' font-size='11' font-weight='700' fill='#434e3a'>Last watered: ${lastWatered(x.id)}</text><text x='${cx}' y='${cy + 112}' text-anchor='middle' font-size='10' fill='#434e3a'>Moisture ${Math.min(...posts.map((s) => s.m ?? x.m))}-${Math.max(...posts.map((s) => s.m ?? x.m))}% across the field</text></g>`;
  const pk = polyKey(x.id);
  return `<g class='ffield${S.hud === x.id ? ' on' : ''}' data-act=pk data-id=${x.id} transform='translate(${(S.off[x.id] ?? [0, 0]).join(' ')})' tabindex=0 role=button aria-label='${esc(x.name)}, ${HL[x.hl][0]}' style='cursor:pointer'><polygon class=fpoly points='${POLY[pk]}' fill='${fillFor(x, layer)}' stroke='${sel ? '#1b2229' : '#fff'}' stroke-width='${sel ? 7 : 3}' stroke-linejoin='round'/><polygon points='${POLY[pk]}' fill='url(#st${(pk.charCodeAt(0) || 0) % 3})' pointer-events='none'/>${zones}<polygon points='${POLY[pk]}' fill=none stroke='#7a5a3a' stroke-width=1.6 stroke-dasharray='2 6' stroke-linecap=round pointer-events=none />${fieldNumberLabel(x.id)}${plants(x.id, x.crop)}${sensors}<g data-w=1><circle cx='${cx}' cy='${cy - 8}' r='24' fill='#fff' stroke='#1b2229' stroke-width='4'/><g transform='translate(${cx - 17} ${cy - 25}) scale(1.21)'>${canIn(ws(x))}</g></g><rect x='${cx - 64}' y='${cy + 18}' width='128' height='42' fill='#1b2229'/><text x='${cx}' y='${cy + 36}' text-anchor='middle' font-size='14' font-weight='800' fill='#f6efd9'>${esc(x.name)}</text><text x='${cx}' y='${cy + 53}' text-anchor='middle' font-size='13' font-weight='800' fill='#f0d6a0'>${valueFor(x, layer)}</text>${hud}</g>`;
};

const treeMark = (a: number, b: number, i: number) => {
  const s = 0.85 + (i % 4) * 0.12;
  const tone = ['#3d6b45', '#4a7a52', '#2f5a38', '#557f5c'][i % 4];
  const tip = ['#5f9468', '#6da074', '#4d7f56', '#78a87e'][i % 4];
  return `<g transform='translate(${a} ${b}) scale(${s})'><rect x='-2' y='-2' width='4' height='10' fill='#5a4030'/><ellipse cx='0' cy='-10' rx='12' ry='10' fill='${tone}'/><ellipse cx='-3' cy='-14' rx='7' ry='6' fill='${tip}'/></g>`;
};
const TREE_SVG = TREES.map((p, i) => treeMark(p[0], p[1], i)).join('');
const MEADOW_SVG = MEADOWS.map((pts, i) => `<polygon points='${pts}' fill='${i % 2 ? '#6f9458' : '#628850'}' fill-opacity='.92'/>`).join('');
const RIDGE_SVG = RIDGES.map(({ x, h, w }, i) => {
  const base = 42;
  const peak = base - Math.min(38, h * 0.28);
  const mid = (base + peak) / 2;
  const fill = ['#5a6d78', '#677b86', '#4c5f6c'][i % 3];
  return `<path d='M${x - w / 2} ${base} L${x - w * 0.22} ${mid} L${x} ${peak} L${x + w * 0.2} ${mid + 4} L${x + w / 2} ${base} Z' fill='${fill}'/><path d='M${x - w * 0.06} ${peak + 6} L${x} ${peak} L${x + w * 0.1} ${peak + 10} Z' fill='#eef3f6' fill-opacity='.5'/>`;
}).join('');

const BASE = `<defs><linearGradient id=land y1=0 y2=1><stop offset=0 stop-color=#7fa867 /><stop offset=.55 stop-color=#6d9658 /><stop offset=1 stop-color=#5f874c /></linearGradient><linearGradient id=water x1=0 x2=1><stop offset=0 stop-color=#3d7aaa /><stop offset=.5 stop-color=#5aa0c8 /><stop offset=1 stop-color=#3a6f9a /></linearGradient></defs><rect width=800 height=520 fill=url(#land) />${MEADOW_SVG}<g>${RIDGE_SVG}</g><path d='M455 200 C478 270 465 360 458 430 S448 520 448 540' stroke='#2f5a3a' stroke-width='28' fill='none' stroke-linecap='round'/><path d='M470 195 C492 275 478 365 468 440 S458 530 458 545' stroke='url(#water)' stroke-width='16' fill='none' stroke-linecap='round'/><path d='M470 195C492 275 478 365 468 440S458 530 458 545' stroke=#fff stroke-opacity=.35 stroke-width=2.5 stroke-dasharray='8 14' fill=none /><path d='M120 510 C180 470 240 455 310 448 S430 430 470 400' stroke='#2f5a3a' stroke-width='18' fill='none' stroke-linecap='round'/><path d='M125 508 C185 472 245 458 315 450 S435 432 472 402' stroke='url(#water)' stroke-width='10' fill='none' stroke-linecap='round'/><ellipse cx='620' cy='460' rx='68' ry='36' fill='#2f5a3a'/><ellipse cx='620' cy='460' rx='60' ry='32' fill='url(#water)'/><ellipse cx='605' cy='452' rx='18' ry='8' fill=#fff fill-opacity=.25 /><text x='620' y='464' text-anchor='middle' font-size='13' font-weight='800' fill='#fff'>Pond</text><rect x='685' y='290' width='72' height='46' rx='5' fill='#8a4a32'/><rect x='760' y='300' width='18' height='20' fill='#a0805a'/><path d='M680 290 L721 268 L762 290' fill='#3b2f2a'/><text x='721' y='318' text-anchor='middle' font-size='13' fill='#fff'>Barn</text><text x='721' y='352' text-anchor='middle' font-size='12' fill='#1f2a18'>Farmstead</text><text transform='translate(490 340) rotate(90)' font-size='11' fill='#1f4a63' text-anchor='middle'>Willow Creek</text>${TREE_SVG}`;

const PIPE_PATH = 'M610 428V412H668V222H275M326 222V30M548 222V48M275 222V482';
const PIPES = `<g fill=none stroke-linecap=round stroke-linejoin=round><path d='${PIPE_PATH}' stroke=#fff stroke-width=6 /><path d='${PIPE_PATH}' stroke=#5b8ec9 stroke-width=2.5 stroke-dasharray='7 6' />${[[326, 222], [548, 222], [275, 222], [668, 300]].map(([a, b]) => `<circle cx=${a} cy=${b} r=7 fill=#fff stroke=#5b8ec9 stroke-width=3 />`).join('')}</g>`;

const PATTERNS = `<defs><pattern id=st0 width=12 height=12 patternUnits=userSpaceOnUse patternTransform=rotate(25)><line x1=0 y1=0 x2=0 y2=12 stroke=#fff stroke-opacity=.35 stroke-width=4 /></pattern><pattern id=st1 width=14 height=14 patternUnits=userSpaceOnUse patternTransform=rotate(-40)><line x1=0 y1=0 x2=0 y2=14 stroke=#000 stroke-opacity=.12 stroke-width=3 /></pattern><pattern id=st2 width=10 height=10 patternUnits=userSpaceOnUse><circle cx=5 cy=5 r=1.6 fill=#fff fill-opacity=.55 /></pattern></defs>`;

/** Map only — farm cards live in the side rail (see main.ts). */
export function map(): string {
  const L = S.ly;
  const dim = `<div class=mpc><button data-act=dim data-k=3 data-testid=view-3d aria-pressed=${S.d3}>3D</button><button data-act=dim data-k=2 data-testid=view-2d aria-pressed=${!S.d3}>2D</button></div>`;
  const hint = S.d3
    ? `<span class=hint3>Drag to rotate · right-drag to pan · scroll to zoom · taller block = ${HEIGHT_MEANS[L]}</span>`
    : `<span class=hint3>Drag to pan · scroll to zoom</span>`;
  const controls = `<div class=mtop><div class=mtl>${dim}<div class=mpc>${LAYERS.map(([key, n]) => `<button data-act=lyr data-k=${key} aria-pressed=${L === key}>${n}</button>`).join('')}</div><div class=mpc><button aria-pressed=${S.edit} data-act=ed>${S.edit ? 'Done' : 'Adjust farm'}</button>${S.edit ? `<button data-act=rl>Standard layout</button>` : ''}</div>${S.edit ? `<span class='mpc note'>Drag parcels to match your farm · Standard layout restores the default</span>` : ''}</div><div class=mtr><div class=mpc><button aria-label='Zoom in' data-act=zm data-f=1.5>+</button><button aria-label='Zoom out' data-act=zm data-f=${1 / 1.5}>−</button><button aria-label='Reset view' data-act=rs>⟲</button></div><div class=mpc><button aria-pressed=${S.bare} data-act=bare data-testid=toggle-cards>${S.bare ? 'Show side panel' : 'Hide side panel'}</button></div></div></div>`;
  const scale = `<div class=mscale aria-hidden=true><span class=north>▲ N</span><span class=sbar><i></i>200 m</span></div>`;
  const svg = `<svg id=fmap viewBox='0 0 ${VIEW_W} ${VIEW_H}' style='width:100%;height:100%;display:block;touch-action:none;cursor:grab' role=group aria-label='Farm map'>${PATTERNS}<g id=vp transform='translate(${S.v.x} ${S.v.y}) scale(${S.v.k})'>${BASE}${F.map((x) => fieldShape(x, L)).join('')}${Object.keys(S.off).length ? '' : PIPES}</g></svg>`;
  if (S.d3) return `<div class='mapbox m3' id=m3 data-testid=map-3d></div>${controls}${hint}`;
  return `<div class='mapbox${S.bare ? ' bare' : ''}'>${svg}</div>${controls}${scale}`;
}

// ---- pan, zoom and layout editing -----------------------------------------

/** How far past the farm edge you can drag (map units). */
const PAN_PAD = 320;
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 5;

function clampView() {
  const v = S.v;
  const minX = VIEW_W * (1 - v.k) - PAN_PAD;
  const maxX = PAN_PAD;
  const minY = VIEW_H * (1 - v.k) - PAN_PAD;
  const maxY = PAN_PAD;
  v.x = Math.min(maxX, Math.max(minX, v.x));
  v.y = Math.min(maxY, Math.max(minY, v.y));
}

function applyView() {
  document.getElementById('vp')?.setAttribute('transform', `translate(${S.v.x} ${S.v.y}) scale(${S.v.k})`);
}

export function zoom(factor: number, px = VIEW_W / 2, py = VIEW_H / 2) {
  const v = S.v;
  const k1 = v.k;
  const k2 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k1 * factor));
  v.x = px - ((px - v.x) * k2) / k1;
  v.y = py - ((py - v.y) * k2) / k1;
  v.k = k2;
  clampView();
  applyView();
}

export function resetView() {
  S.v = { x: 0, y: 0, k: 1 };
  applyView();
}

/** Screen pixels to viewBox units, for an SVG scaled with "meet". */
const viewScale = (svg: Element) => {
  const r = svg.getBoundingClientRect();
  return { r, s: Math.max(VIEW_W / r.width, VIEW_H / r.height) };
};

export function onMapWheel(e: WheelEvent, svg: Element) {
  e.preventDefault();
  const { r, s } = viewScale(svg);
  zoom(
    e.deltaY < 0 ? 1.2 : 1 / 1.2,
    (e.clientX - r.left - (r.width - VIEW_W / s) / 2) * s,
    (e.clientY - r.top - (r.height - VIEW_H / s) / 2) * s,
  );
}

/** Follows the pointer until release; S.moved suppresses the click that ends a drag. */
function track(onMove: (ev: PointerEvent) => void, onUp?: () => void) {
  const up = () => {
    onUp?.();
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', up);
    setTimeout(() => (S.moved = false), 0);
  };
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', up);
}

export function onMapPointerDown(e: PointerEvent, svg: Element) {
  if (e.button > 0) return;
  S.moved = false;
  const target = e.target as Element;
  const shape = S.edit ? target.closest<SVGGElement>('g[data-id]') : null;
  if (shape) {
    const id = shape.dataset.id as FieldId;
    const start = S.off[id] ?? [0, 0];
    const s = viewScale(svg).s / S.v.k;
    const sx = e.clientX;
    const sy = e.clientY;
    track(
      (ev) => {
        const nx = Math.max(-400, Math.min(400, Math.round(start[0] + (ev.clientX - sx) * s)));
        const ny = Math.max(-300, Math.min(300, Math.round(start[1] + (ev.clientY - sy) * s)));
        S.off[id] = [nx, ny];
        shape.setAttribute('transform', `translate(${nx} ${ny})`);
        S.moved = true;
      },
      saveOffsets,
    );
    e.preventDefault();
    return;
  }
  const { s } = viewScale(svg);
  let lx = e.clientX;
  let ly = e.clientY;
  (svg as SVGElement).style.cursor = 'grabbing';
  track(
    (ev) => {
      if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 4) S.moved = true;
      if (!S.moved) return;
      S.v.x += (ev.clientX - lx) * s;
      S.v.y += (ev.clientY - ly) * s;
      clampView();
      applyView();
      lx = ev.clientX;
      ly = ev.clientY;
    },
    () => {
      (svg as SVGElement).style.cursor = 'grab';
    },
  );
  e.preventDefault();
}
