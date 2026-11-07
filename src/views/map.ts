import { BRIDGES, FB, HL, LANES, POLY, TREES, WS } from '../seed/farm';
import { F } from '../seed/simulate';
import { S, saveOffsets } from '../state';
import type { Field, FieldId, Health, MapLayer } from '../types';
import { mix, T, ws } from '../ui/helpers';
import { canIn, fieldNumberLabel, plants, polyPoints } from '../ui/icons';

const VIEW_W = 800;
const VIEW_H = 520;
export const SENSOR_OFFSETS: [number, number][] = [[-70, -55], [70, -55], [-70, 60], [70, 60]];
const HEALTH_FILL: Record<Health, string> = { ok: '#8fc47a', wn: '#f0c75a', cr: '#e07a63' };
const HEIGHT_MEANS: Record<MapLayer, string> = { water: 'needs water sooner', health: 'needs more attention', moisture: 'wetter soil', temp: 'warmer soil' };
const LAYERS: [MapLayer, string][] = [['water', 'Watering'], ['health', 'Health'], ['moisture', 'Moisture'], ['temp', 'Temp']];

export const center = (id: FieldId): [number, number] => {
  const p = polyPoints(id);
  return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
};

export const fillFor = (x: Field, layer: MapLayer) => {
  if (layer === 'water') return FB[ws(x)].bg;
  if (layer === 'health') return HEALTH_FILL[x.hl];
  if (layer === 'moisture') return mix([207, 227, 238], [47, 120, 168], x.m / 55);
  return mix([246, 223, 176], [217, 130, 43], (x.st - 10) / 14);
};

export const valueFor = (x: Field, layer: MapLayer) => {
  if (layer === 'water') return WS[ws(x)].t;
  if (layer === 'health') return HL[x.hl][0];
  if (layer === 'moisture') return x.m + '% moisture';
  return T(x.st);
};

const fieldShape = (x: Field, layer: MapLayer) => {
  const [cx, cy] = center(x.id);
  const sel = S.sel === x.id;
  const sensors = Array.from({ length: x.s[1] }, (_, i) => {
    const online = i < x.s[0];
    const [dx, dy] = SENSOR_OFFSETS[i];
    return `<circle cx='${cx + dx}' cy='${cy + dy}' r='6' fill='${online ? '#1f3d27' : '#fff'}' stroke='${online ? '#fff' : '#b97a00'}' stroke-width='${online ? 2 : 3}'/>`;
  }).join('');
  return `<g data-act=pk data-id=${x.id} transform='translate(${(S.off[x.id] ?? [0, 0]).join(' ')})' tabindex=0 role=button aria-label='${x.name}, ${HL[x.hl][0]}' style='cursor:pointer'><polygon points='${POLY[x.id]}' fill='${fillFor(x, layer)}' stroke='${sel ? '#1b2229' : '#fff'}' stroke-width='${sel ? 7 : 3}' stroke-linejoin='round'/><polygon points='${POLY[x.id]}' fill='url(#st${'ABCDEF'.indexOf(x.id) % 3})' pointer-events='none'/><polygon points='${POLY[x.id]}' fill=none stroke='#7a5a3a' stroke-width=1.6 stroke-dasharray='2 6' stroke-linecap=round pointer-events=none />${fieldNumberLabel(x.id)}${plants(x.id, x.crop)}${sensors}<g data-w=1><circle cx='${cx}' cy='${cy - 8}' r='24' fill='#fff' stroke='#1b2229' stroke-width='4'/><g transform='translate(${cx - 17} ${cy - 25}) scale(1.21)'>${canIn(ws(x))}</g></g><rect x='${cx - 64}' y='${cy + 18}' width='128' height='42' fill='#1b2229'/><text x='${cx}' y='${cy + 36}' text-anchor='middle' font-size='14' font-weight='800' fill='#f6efd9'>${x.name}</text><text x='${cx}' y='${cy + 53}' text-anchor='middle' font-size='13' font-weight='800' fill='#f0d6a0'>${valueFor(x, layer)}</text></g>`;
};

const LANES_SVG = `<g fill=none stroke-linecap=square>${LANES.map(({ from: [a, b], to: [c, d], w }) => `<path d='M${a} ${b}L${c} ${d}' stroke=#6e542c stroke-width=${w + 4} /><path d='M${a} ${b}L${c} ${d}' stroke=#c4a36a stroke-width=${w} />`).join('')}</g>`;
const BRIDGE_SVG = BRIDGES.map(([x, y]) => `<rect x=${x - 14} y=${y - 9} width=28 height=18 fill=#8a6a48 stroke=#4a3a28 stroke-width=1.6 /><path d='M${x - 12} ${y}L${x + 12} ${y}' stroke=#d7c4a0 stroke-width=2 stroke-dasharray='4 3' />`).join('');
const TREE_SVG = TREES.filter(([x, y]) => x >= 0 && x <= 800 && y >= 0 && y <= 520)
  .map(([a, b]) => `<circle cx='${a}' cy='${b}' r='11' fill='#56755f'/><circle cx='${a - 2}' cy='${b - 3}' r='5' fill='#6b8a70'/>`)
  .join('');

const BASE = `<rect width=800 height=520 fill=#efe6c8 /><path d='M0 120C120 90 220 140 330 110S560 70 800 100M0 330C140 300 260 360 400 330S640 290 800 320M0 450C160 430 300 480 460 455S680 430 800 460' fill=none stroke=#dccfa5 stroke-width=2 />${LANES_SVG}<path d='M470 215 C492 300 478 400 468 520' stroke='#5b8ec9' stroke-width='12' fill='none'/>${BRIDGE_SVG}<path d='M0 228 L800 228' stroke='#4a3a28' stroke-width='16'/><path d='M0 228 L800 228' stroke='#fff' stroke-opacity='.6' stroke-width='2' stroke-dasharray='12 10'/><ellipse cx='620' cy='460' rx='60' ry='32' fill='#5b8ec9'/><text x='620' y='464' text-anchor='middle' font-size='13' font-weight='800' fill='#fff'>Pond</text><rect x='685' y='290' width='72' height='46' rx='5' fill='#8a6a48'/><rect x='760' y='300' width='18' height='20' fill='#a0805a'/><text x='721' y='318' text-anchor='middle' font-size='13' fill='#fff'>Barn</text><text x='721' y='352' text-anchor='middle' font-size='12' fill='#3a2a14'>Farmstead</text><text x='70' y='232' font-size='11' fill='#efe6c8'>Concession Road 4</text><text x='600' y='232' font-size='11' fill='#efe6c8'>Concession Road 4</text><text transform='translate(11 370) rotate(-90)' font-size='11' fill='#efe6c8' text-anchor='middle'>Sideroad 27</text><text transform='translate(789 200) rotate(90)' font-size='11' fill='#efe6c8' text-anchor='middle'>Sideroad 25</text><text x='400' y='13' text-anchor='middle' font-size='10' fill='#3a2a14'>North farm lane</text><text x='200' y='516' text-anchor='middle' font-size='10' fill='#3a2a14'>South farm lane</text><text transform='translate(484 340) rotate(90)' font-size='11' fill='#1f4a63' text-anchor='middle'>Willow Creek</text><path d='M470 215C492 300 478 400 468 520' stroke=#fff stroke-opacity=.55 stroke-width=2 stroke-dasharray='6 12' fill=none /><g transform='translate(360 210)'><rect x=0 y=6 width=26 height=10 rx=2 fill=#c0392b /><rect x=14 y=-2 width=11 height=9 rx=1 fill=#e8e1c8 /><circle cx=7 cy=18 r=6 fill=#222 /><circle cx=22 cy=19 r=4 fill=#222 /></g>${TREE_SVG}`;

const PIPE_PATH = 'M610 428V412H668V222H275M326 222V30M548 222V48M275 222V482';
const PIPES = `<g fill=none stroke-linecap=round stroke-linejoin=round><path d='${PIPE_PATH}' stroke=#fff stroke-width=6 /><path d='${PIPE_PATH}' stroke=#5b8ec9 stroke-width=2.5 stroke-dasharray='7 6' />${[[326, 222], [548, 222], [275, 222], [668, 300]].map(([a, b]) => `<circle cx=${a} cy=${b} r=7 fill=#fff stroke=#5b8ec9 stroke-width=3 />`).join('')}</g>`;

const PATTERNS = `<defs><pattern id=st0 width=12 height=12 patternUnits=userSpaceOnUse patternTransform=rotate(25)><line x1=0 y1=0 x2=0 y2=12 stroke=#fff stroke-opacity=.35 stroke-width=4 /></pattern><pattern id=st1 width=14 height=14 patternUnits=userSpaceOnUse patternTransform=rotate(-40)><line x1=0 y1=0 x2=0 y2=14 stroke=#000 stroke-opacity=.12 stroke-width=3 /></pattern><pattern id=st2 width=10 height=10 patternUnits=userSpaceOnUse><circle cx=5 cy=5 r=1.6 fill=#fff fill-opacity=.55 /></pattern></defs>`;

/** The map with its controls, and the two columns of cards floating over it. */
export function map(left: string, right: string): string {
  const L = S.ly;
  const dim = `<div class=mpc><button data-act=dim data-k=3 data-testid=view-3d aria-pressed=${S.d3}>3D</button><button data-act=dim data-k=2 data-testid=view-2d aria-pressed=${!S.d3}>2D</button></div>`;
  const hint = S.d3 ? `<span class=hint3>Drag to rotate · right-drag to pan · scroll to zoom · taller block = ${HEIGHT_MEANS[L]}</span>` : '';
  const controls = `<div class=mtop><div class=mtl>${dim}<div class=mpc>${LAYERS.map(([key, n]) => `<button data-act=lyr data-k=${key} aria-pressed=${L === key}>${n}</button>`).join('')}</div><div class=mpc><button aria-pressed=${S.edit} data-act=ed>${S.edit ? 'Done editing' : 'Edit layout'}</button>${S.edit ? `<button data-act=rl>Reset</button>` : ''}</div>${S.edit ? `<span class='mpc note'>Drag fields to match your farm</span>` : ''}</div><div class=mtr><div class=mpc><button aria-label='Zoom in' data-act=zm data-f=1.5>+</button><button aria-label='Zoom out' data-act=zm data-f=${1 / 1.5}>−</button><button aria-label='Reset view' data-act=rs>⟲</button></div><div class=mpc><button aria-pressed=${S.bare} data-act=bare data-testid=toggle-cards>${S.bare ? 'Show cards' : 'Hide cards'}</button></div></div></div>`;
  const scale = `<div class=mscale aria-hidden=true><span class=north>▲ N</span><span class=sbar><i></i>200 m</span></div>`;
  const svg = `<svg id=fmap viewBox='0 0 ${VIEW_W} ${VIEW_H}' style='width:100%;height:100%;display:block;touch-action:none;cursor:grab' role=group aria-label='Farm map'>${PATTERNS}<g id=vp transform='translate(${S.v.x} ${S.v.y}) scale(${S.v.k})'>${BASE}${F.map((x) => fieldShape(x, L)).join('')}${Object.keys(S.off).length ? '' : PIPES}</g></svg>`;
  const cols = S.bare ? '' : `<aside class='col col-l' data-scroll=l>${left}</aside><aside class='col col-r' data-scroll=r>${right}</aside>`;
  if (S.d3) return `<div class='mapbox m3' id=m3 data-testid=map-3d></div>${controls}${hint}${cols}`;
  return `<div class='mapbox${S.bare ? ' bare' : ''}'>${svg}</div>${controls}${scale}${cols}`;
}

// ---- pan, zoom and layout editing -----------------------------------------

function clampView() {
  const v = S.v;
  v.x = Math.min(0, Math.max(VIEW_W * (1 - v.k), v.x));
  v.y = Math.min(0, Math.max(VIEW_H * (1 - v.k), v.y));
}

function applyView() {
  document.getElementById('vp')?.setAttribute('transform', `translate(${S.v.x} ${S.v.y}) scale(${S.v.k})`);
}

export function zoom(factor: number, px = VIEW_W / 2, py = VIEW_H / 2) {
  const v = S.v;
  const k1 = v.k;
  const k2 = Math.max(1, Math.min(4, k1 * factor));
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
  track((ev) => {
    if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 6) S.moved = true;
    if (S.moved) {
      S.v.x += (ev.clientX - lx) * s;
      S.v.y += (ev.clientY - ly) * s;
      clampView();
      applyView();
    }
    lx = ev.clientX;
    ly = ev.clientY;
  });
}
