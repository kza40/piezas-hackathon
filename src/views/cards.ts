import { W, WS } from '../seed/farm';
import { DN, F, REC, RT, fld } from '../seed/simulate';
import { S } from '../state';
import type { CardId, PanelId, WaterState } from '../types';
import { esc, firstName, openAlerts, pill, T, ws } from '../ui/helpers';
import { can } from '../ui/icons';

const ORDER: Record<WaterState, number> = { now: 0, soon: 1, rain: 2, none: 3 };

/** Collapsible card shell: the header toggles the body, the arrow opens the full view. */
function mapCard(id: CardId, title: string, panel: PanelId, body: string, count?: number) {
  const min = !!S.min[id];
  return `<section class=mc data-testid=card-${id}><header class=mch><button class=mct data-act=tog data-c=${id} aria-expanded=${!min}><span>${title}</span>${count !== undefined ? `<span class=badge>${count}</span>` : ''}<span class=chev aria-hidden=true>${min ? '▸' : '▾'}</span></button><button class=mcx data-act=go data-p=${panel} aria-label='Open ${title} in full'>↗</button></header>${min ? '' : `<div class=mcb>${body}</div>`}</section>`;
}

export function todayCard(): string {
  const list = [...F].sort((a, b) => ORDER[ws(a)] - ORDER[ws(b)]);
  const n = list.filter((x) => ws(x) === 'now').length;
  const healthy = F.filter((x) => x.hl === 'ok').length;
  const online = F.reduce((a, x) => a + x.s[0], 0);
  const total = F.reduce((a, x) => a + x.s[1], 0);
  const rows = list
    .map((x) => {
      const k = ws(x);
      return `<button class=mrow data-act=pk data-id=${x.id} aria-pressed=${x.id === S.sel}>${can(k, 26)}<span class=mrn>${x.name}</span><span class=mrv style='color:${WS[k].c}'>${x.m}%</span></button>`;
    })
    .join('');
  const body = `<p class=kick>Good morning, ${esc(firstName())} · ${esc(S.farm)}</p><p class=mbig>${n ? `Water ${n} field${n > 1 ? 's' : ''} today.` : 'Nothing to water today.'}</p><p class=mut>${healthy} of ${F.length} fields healthy · ${online}/${total} sensors reporting</p>${rows}`;
  return mapCard('today', 'Today', 'dashboard', body);
}

export function weatherCard(): string {
  const bars = W.map(
    (d) => `<div class=wc><b>${d.rain}%</b><div class=wb><i style='height:${Math.max(4, d.rain)}%'></i></div><b>${d.day.slice(0, 3)}</b><span>${T(d.temp)}</span></div>`,
  ).join('');
  const body = `<p><b>${T(16)}, sunny</b> <span class=mut>· wind 12 km/h · humidity 58%</span></p><div class='wk wk-sm'>${bars}</div><p class=mut>Rain tomorrow (6 mm) and Tuesday (14 mm). ${RT} mm fell last ${DN(64)}.</p>`;
  return mapCard('weather', 'Weather', 'weather', body);
}

export function alertsCard(): string {
  const open = openAlerts();
  const items = open.length
    ? open
        .slice(0, 3)
        .map(
          (a) =>
            `<div class=item>${pill(a.l)}<div style='flex:1'><b>${a.t}</b><div class=mut>${a.d}</div></div><button class='btn alt sm' data-act=dis data-aid=${a.id} aria-label='Dismiss ${a.t}'>✕</button></div>`,
        )
        .join('') + (open.length > 3 ? `<button class='btn alt sm' data-act=go data-p=alerts>See all ${open.length}</button>` : '')
    : '<p class=mut>Nothing needs your attention.</p>';
  return mapCard('alerts', 'Alerts', 'alerts', items, open.length);
}

export function actionsCard(): string {
  const todo = REC.filter((r) => r.p !== 'in' && !S.done[r.id]);
  const items = todo.length
    ? todo
        .slice(0, 3)
        .map(
          (r) =>
            `<div class=item>${can(ws(fld(r.f)), 26)}<div style='flex:1'><b>${r.t}</b></div><button class='btn sm' data-act=done data-rid=${r.id}>Done</button></div>`,
        )
        .join('') + (todo.length > 3 ? `<button class='btn alt sm' data-act=go data-p=recs>See all ${todo.length}</button>` : '')
    : '<p class=mut>All caught up.</p>';
  return mapCard('recs', 'To do', 'recs', items, todo.length);
}
