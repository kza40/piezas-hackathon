import './styles.css';
import { fld } from './seed/simulate';
import { S, saveLog, saveOffsets } from './state';
import type { AlertFilter, FieldId, MapLayer, MetricKey, Page, Units } from './types';
import { esc, firstName, initials, openAlerts } from './ui/helpers';
import { can, IC } from './ui/icons';
import { map, onMapPointerDown, onMapWheel, resetView, zoom } from './views/map';
import * as pages from './views/pages';

const VIEWS: Record<Page, () => string> = {
  login: pages.login,
  map,
  dashboard: pages.dashboard,
  field: pages.field,
  weather: pages.weather,
  recs: pages.recs,
  alerts: pages.alerts,
  settings: pages.settings,
  profile: pages.profile,
};

const NAV: [Page, string, string][] = [
  ['map', 'Map', '▦'],
  ['dashboard', 'Farm', '⌂'],
  ['field', 'Fields', '❀'],
  ['weather', 'Weather', '☁'],
  ['recs', 'Actions', '✎'],
  ['alerts', 'Alerts', '🔔'],
  ['settings', 'Settings', '⚙'],
];

const el = (id: string) => document.getElementById(id) as HTMLElement;
const isPage = (p: string): p is Page => p in VIEWS;

function renderNav() {
  const current = (p: Page) => (S.page === p ? 'aria-current="page"' : '');
  el('nav').innerHTML =
    `<div class="logo" style="display:flex;align-items:center;gap:8px">${can('now', 28, '#fff')}Fieldwise</div>` +
    NAV.map(
      ([k, n, i]) =>
        `<button data-act="go" data-p="${k}" data-testid="nav-${k}" ${current(k)}><span aria-hidden="true" style="display:grid">${IC[k] ?? i}</span>${n}${k === 'alerts' ? `<span class="badge">${openAlerts().length}</span>` : ''}</button>`,
    ).join('') +
    `<button style="margin-left:auto" data-act="go" data-p="profile" data-testid="nav-profile" ${current('profile')} aria-label="Farmer profile"><span class="pill in" aria-hidden="true">${esc(initials())}</span>${esc(firstName())}</button>`;
}

function render() {
  const main = el('main');
  const onLogin = S.page === 'login';
  main.className = S.page === 'map' ? 'mp' : '';
  el('app').style.display = onLogin ? 'block' : '';
  el('nav').style.display = onLogin ? 'none' : '';
  renderNav();
  main.innerHTML =
    VIEWS[S.page]() +
    (S.wm ? pages.wateringModal(fld(S.wm)) : '') +
    (S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : '');
}

function go(p: string, id?: string) {
  const page = p === 'sensors' ? 'field' : p;
  if (!isPage(page)) return;
  if (id) S.sel = id as FieldId;
  S.page = page;
  location.hash = page;
  render();
  scrollTo(0, 0);
}

let toastTimer: number | undefined;
function say(text: string) {
  S.toast = text;
  render();
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    S.toast = '';
    render();
  }, 1800);
}

function logWater(mm: number) {
  const time = new Date().toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  S.log.unshift({ f: S.sel, d: 'Today, ' + time, mm });
  saveLog();
  say(`Logged ${mm} mm for ${fld(S.sel).name}`);
}

type ActionElement = Element & { dataset: DOMStringMap };

function act(node: ActionElement, target: Element) {
  const d = node.dataset;
  switch (d.act) {
    case 'go':
      return go(d.p ?? 'map', d.id);
    case 'sel':
      S.sel = d.id as FieldId;
      return render();
    case 'op':
      S.wm = d.id as FieldId;
      return render();
    case 'cm':
      // The backdrop closes only when the click lands on it, not inside the sheet.
      if (node.classList.contains('mdl') && target !== node) return;
      S.wm = null;
      return render();
    case 'gf':
      S.wm = null;
      return go('field', d.id);
    case 'pk':
      if (S.moved) return;
      S.sel = d.id as FieldId;
      if (target.closest('[data-w]')) S.wm = S.sel;
      return render();
    case 'pkm':
      return go('map', d.id);
    case 'sf':
      S.fd = d.id as FieldId;
      return render();
    case 'done':
      S.done[Number(d.rid)] = true;
      return say('Marked done');
    case 'dis':
      S.dis[Number(d.aid)] = true;
      return render();
    case 'say':
      return say(d.t ?? '');
    case 'flt':
      S.flt = d.k as AlertFilter;
      return render();
    case 'mk':
      S.mk = d.k as MetricKey;
      return render();
    case 'lyr':
      S.ly = d.k as MapLayer;
      return render();
    case 'ed':
      S.edit = !S.edit;
      return render();
    case 'rl':
      S.off = {};
      saveOffsets();
      return render();
    case 'zm':
      return zoom(Number(d.f));
    case 'rs':
      return resetView();
    case 'lg':
      return logWater(Number(d.mm));
  }
}

document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const node = target.closest<ActionElement>('[data-act]');
  if (node) act(node, target);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const target = e.target as Element;
  if (target instanceof SVGElement && target.dataset.act === 'pk') act(target, target);
});

document.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  const key = input.dataset?.bind;
  if (key === 'farm' || key === 'name') {
    S[key] = input.value;
    renderNav();
  }
});

document.addEventListener('change', (e) => {
  const input = e.target as HTMLSelectElement;
  const key = input.dataset?.bind;
  if (key === 'role') {
    S.role = input.value;
    renderNav();
  } else if (key === 'units') {
    S.units = input.value as Units;
    render();
  }
});

const main = el('main');
main.addEventListener('pointerdown', (e) => {
  const svg = (e.target as Element).closest('#fmap');
  if (svg) onMapPointerDown(e, svg);
});
main.addEventListener(
  'wheel',
  (e) => {
    const svg = (e.target as Element).closest('#fmap');
    if (svg) onMapWheel(e, svg);
  },
  { passive: false },
);

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (isPage(h) && h !== S.page && (h === 'login' || S.step === 2 || S.page !== 'login')) {
    S.page = h;
    render();
  }
});

render();
