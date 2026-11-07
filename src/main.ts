import './styles.css';
import { fld } from './seed/simulate';
import { S, saveCards, saveLog, saveOffsets } from './state';
import type { AlertFilter, CardId, FieldId, MapLayer, MetricKey, PanelId, Units } from './types';
import { esc, openAlerts } from './ui/helpers';
import { IC } from './ui/icons';
import { actionsCard, alertsCard, fieldCard, legendCard, profileCard, todayCard, topBar, weatherCard } from './views/cards';
import { map, onMapPointerDown, onMapWheel, resetView, zoom } from './views/map';
import { mount3D, reset3D, zoom3D } from './views/map3d';
import * as pages from './views/pages';

const PANELS: Record<PanelId, { title: string; icon: string; view: () => string }> = {
  dashboard: { title: 'Farm', icon: '⌂', view: pages.dashboard },
  field: { title: 'Fields', icon: '❀', view: pages.field },
  weather: { title: 'Weather', icon: '☁', view: pages.weather },
  recs: { title: 'Advice', icon: '✎', view: pages.recs },
  alerts: { title: 'Alerts', icon: '🔔', view: pages.alerts },
  settings: { title: 'Settings', icon: '⚙', view: pages.settings },
  profile: { title: 'Profile', icon: '', view: pages.profile },
};

const el = (id: string) => document.getElementById(id) as HTMLElement;
const isPanel = (p: string): p is PanelId => p in PANELS;

function dock(): string {
  return `<nav class=dock aria-label='Farm tools'>${(Object.keys(PANELS) as PanelId[])
    .filter((k) => k !== 'profile')
    .map((k) => {
      const p = PANELS[k];
      const icon = IC[k] ?? p.icon;
      const badge = k === 'alerts' ? `<span class=badge>${openAlerts().length}</span>` : '';
      return `<button data-act=go data-p=${k} data-testid=dock-${k} aria-pressed=${S.panel === k}><span aria-hidden=true class=di>${icon}</span><span class=dl>${p.title}</span>${badge}</button>`;
    })
    .join('')}</nav>`;
}

function panel(id: PanelId): string {
  const narrow = id === 'settings' || id === 'profile' ? ' panel-center' : '';
  return `<section class='panel${narrow}' data-testid=panel-${id} data-scroll=p role=dialog aria-label='${PANELS[id].title}'><button class='btn alt sm pclose' data-act=go data-p=map aria-label='Close and show the map'>✕ Back to map</button><div class=panel-body>${PANELS[id].view()}</div></section>`;
}

/** Re-rendering replaces the overlays, so keep each scrolled area where the farmer left it. */
function keepScroll(paint: () => void) {
  const before = new Map<string, number>();
  document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((n) => before.set(n.dataset.scroll! + (n.dataset.testid ?? ''), n.scrollTop));
  paint();
  document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((n) => {
    const top = before.get(n.dataset.scroll! + (n.dataset.testid ?? ''));
    if (top) n.scrollTop = top;
  });
}

function render() {
  const main = el('main');
  const toast = S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : '';
  const modal = S.wm ? pages.wateringModal(fld(S.wm)) : '';
  if (S.page === 'login') {
    main.className = '';
    main.innerHTML = pages.login() + toast;
    return;
  }
  main.className = 'mp';
  const left = fieldCard() + todayCard() + legendCard(S.ly);
  const right = profileCard() + alertsCard() + actionsCard() + weatherCard();
  keepScroll(() => {
    main.innerHTML = `<div class=board>${topBar()}<div class=stage>${map(left, right)}${S.panel ? panel(S.panel) : ''}${dock()}</div></div>${modal}${toast}`;
  });
  const host = document.getElementById('m3');
  if (host) mount3D(host, pickField);
}

function pickField(id: FieldId) {
  S.sel = id;
  if (S.min.field) {
    delete S.min.field;
    saveCards();
  }
  render();
}

function go(p: string, id?: string) {
  const target = p === 'sensors' ? 'field' : p;
  if (id) S.sel = id as FieldId;
  if (target === 'login') {
    S.page = 'login';
    S.panel = null;
  } else if (isPanel(target)) {
    S.page = 'map';
    S.panel = S.panel === target && !id ? null : target;
  } else {
    S.page = 'map';
    S.panel = null;
  }
  location.hash = S.page === 'login' ? 'login' : (S.panel ?? 'map');
  render();
  document.querySelector('.panel')?.scrollTo(0, 0);
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
    case 'tog': {
      const c = d.c as CardId;
      if (S.min[c]) delete S.min[c];
      else S.min[c] = true;
      saveCards();
      return render();
    }
    case 'bare':
      S.bare = !S.bare;
      saveCards();
      return render();
    case 'me':
      // Small screens have no room for the side column, so the profile opens in full.
      if (matchMedia('(max-width: 760px)').matches) return go('profile');
      S.bare = false;
      delete S.min.profile;
      saveCards();
      render();
      return document.querySelector('[data-testid=card-profile]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
      if (S.min.field) {
        delete S.min.field;
        saveCards();
      }
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
      // Fields are dragged into place on the flat map.
      S.edit = !S.edit;
      if (S.edit) S.d3 = false;
      return render();
    case 'dim':
      S.d3 = d.k === '3';
      if (S.d3) S.edit = false;
      saveCards();
      return render();
    case 'rl':
      S.off = {};
      saveOffsets();
      return render();
    case 'zm':
      return S.d3 ? zoom3D(Number(d.f)) : zoom(Number(d.f));
    case 'rs':
      return S.d3 ? reset3D() : resetView();
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
  if (e.key === 'Escape') {
    if (S.wm) {
      S.wm = null;
      render();
    } else if (S.panel) go('map');
    return;
  }
  if (e.key !== 'Enter') return;
  const target = e.target as Element;
  if (target instanceof SVGElement && target.dataset.act === 'pk') act(target, target);
});

document.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  const key = input.dataset?.bind;
  if (key === 'farm' || key === 'name') S[key] = input.value;
});

document.addEventListener('change', (e) => {
  const input = e.target as HTMLSelectElement;
  const key = input.dataset?.bind;
  if (key === 'role') S.role = input.value;
  else if (key === 'units') S.units = input.value as Units;
  else if (key !== 'farm' && key !== 'name') return;
  // Typing in a field: wait until it's committed, so the input keeps its focus.
  render();
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
  const current = S.page === 'login' ? 'login' : (S.panel ?? 'map');
  if (h === current) return;
  if (h === 'login' || h === 'map' || isPanel(h)) go(h);
});

render();
