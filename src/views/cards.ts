import { FARM, FB, PROFILE, W, WS } from '../seed/farm';
import { AL, DN, F, REC, RT, SEN, fld } from '../seed/simulate';
import { S } from '../state';
import type { CardId, Field, MapLayer, PanelId, WaterState } from '../types';
import { esc, fieldNo, firstName, initials, openAlerts, pill, T, ws } from '../ui/helpers';
import { can } from '../ui/icons';

const ORDER: Record<WaterState, number> = { now: 0, soon: 1, rain: 2, none: 3 };
const LAYER_KEY: Record<Exclude<MapLayer, 'water'>, string> = {
  health: 'Green = healthy, yellow = needs attention, red = critical.',
  moisture: 'Darker blue = wetter soil.',
  temp: 'Darker orange = warmer soil.',
};

export const totalAcres = () => F.reduce((a, x) => a + x.ac, 0);
const sensorsOnline = () => [F.reduce((a, x) => a + x.s[0], 0), F.reduce((a, x) => a + x.s[1], 0)];

interface CardOpts {
  /** Shown in the header while the card is minimized. */
  sum?: string;
  count?: number;
  /** Full view behind the ↗ button. */
  panel?: PanelId;
  cls?: string;
}

/** Card shell: the minimize button folds it to a one-line header; ↗ opens the full view. */
function mapCard(id: CardId, title: string, body: string, o: CardOpts = {}) {
  const min = !!S.min[id];
  const badge = o.count ? `<span class=badge>${o.count}</span>` : '';
  const sum = min && o.sum ? `<span class=msum>${o.sum}</span>` : '';
  const open = o.panel ? `<button class=mci data-act=go data-p=${o.panel} aria-label='Open ${title} in full' title='Open full view'>↗</button>` : '';
  return `<section class='mc ${o.cls ?? ''}${min ? ' min' : ''}' data-testid=card-${id}><header class=mch><button class=mct data-act=tog data-c=${id} aria-expanded=${!min}><span class=mtt>${title}</span>${badge}${sum}</button>${open}<button class=mci data-act=tog data-c=${id} data-testid=min-${id} aria-label='${min ? 'Expand' : 'Minimize'} ${title}' title='${min ? 'Expand' : 'Minimize'}'>${min ? '+' : '–'}</button></header>${min ? '' : `<div class=mcb>${body}</div>`}</section>`;
}

const kv = (k: string, v: string) => `<div class=kv><span>${k}</span><b>${v}</b></div>`;

// ---- farmer profile ------------------------------------------------------

export function profileCard(): string {
  const crew = PROFILE.crew
    .map(
      (c) =>
        `<span class=crew title='${c.name}, ${c.role} · ${c.on ? 'on shift' : 'off today'}'><span class='av sm'>${c.name.split(' ').map((w) => w[0]).join('')}</span><span>${c.name.split(' ')[0]}<br><span class=mut>${c.role}</span></span><i class='dot ${c.on ? 'on' : ''}'></i></span>`,
    )
    .join('');
  const body = `<div class=prof><span class=av>${esc(initials())}</span><div><b class=pnm>${esc(S.name)}</b><div class='mut tiny'>${esc(S.role)} · ${esc(S.farm)} · farming since ${PROFILE.since}</div></div></div><div class='kvs g2'>${kv('Phone', PROFILE.phone)}${kv('Watering logged', `${S.log.length} this week`)}${kv('Email', PROFILE.email)}${kv('Alerts', 'Text + email')}</div><p class=sub>Crew today</p><div class=crews>${crew}</div><div class=btns><button class='btn sm' data-act=go data-p=profile>Edit profile</button><button class='btn alt sm' data-act=go data-p=settings>Settings</button><button class='btn alt sm' data-act=go data-p=login>Sign out</button></div>`;
  return mapCard('profile', 'Farmer profile', body, { sum: `${esc(S.name)} · ${esc(S.role)}`, panel: 'profile', cls: 'pcard' });
}

// ---- selected field --------------------------------------------------------

/** Field average of the sensors that are still reporting, one point every 3 hours. */
function moistureHistory(f: Field): number[] {
  const live = SEN.filter((s) => s.f === f.id && s.age <= 6);
  const out: number[] = [];
  for (let t = 0; t < 168; t += 3) {
    const v = live.map((s) => s.vals.m[t]).filter((x, i): x is number => x != null && !live[i].gl.m.has(t));
    if (v.length) out.push(v.reduce((a, b) => a + b, 0) / v.length);
  }
  return out;
}

function spark(f: Field): string {
  const h = moistureHistory(f);
  const lo = Math.min(...h, f.mi[0]) - 3;
  const hi = Math.max(...h, f.mi[1]) + 3;
  const y = (v: number) => 54 - ((v - lo) / (hi - lo)) * 50;
  const x = (i: number) => (i / (h.length - 1)) * 300;
  const pts = h.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const band = `<rect x=0 y=${y(f.mi[1]).toFixed(1)} width=300 height=${(y(f.mi[0]) - y(f.mi[1])).toFixed(1)} fill='#4f8a63' fill-opacity=.16 />`;
  return `<svg class=spark viewBox='0 0 300 58' preserveAspectRatio=none role=img aria-label='Soil moisture, last 7 days'>${band}<polyline points='${pts}' fill=none stroke='#3d5f8f' stroke-width=2.2 vector-effect=non-scaling-stroke /><circle cx=${x(h.length - 1)} cy=${y(h[h.length - 1])} r=3.5 fill='#3d5f8f'/></svg><div class='row mut tiny'><span>${DN(0)}</span><span>Ideal ${f.mi[0]}–${f.mi[1]}% shaded</span><span>Now</span></div>`;
}

export function fieldCard(): string {
  const f = fld(S.sel);
  const k = ws(f);
  const look = FB[k];
  const h = moistureHistory(f);
  const d24 = Math.round((h[h.length - 1] - h[h.length - 9]) * 10) / 10;
  const trend = `<span class=trend>${d24 > 0 ? '▲' : d24 < 0 ? '▼' : '■'} ${Math.abs(d24)} pts / 24 h</span>`;
  const r = REC.find((q) => q.f === f.id);
  const last = S.log.find((e) => e.f === f.id);
  const hero = `<div class=fhero style='background:${look.bg};color:${look.fg}'><div><div class=fn style='color:${look.n}'>${f.m}<span>%</span></div><div class=fsub>Soil moisture · ${trend}</div></div><button class=cb data-act=op data-id=${f.id} aria-label='Watering details'>${can(k, 48)}</button><p class=chip style='background:${look.fg};color:${look.bg}'><i style='background:${WS[k].h}'></i>${look.c}</p></div>`;
  const grid = `<div class='kvs g2'>${kv('Crop', `${f.crop} · ${f.stage}`)}${kv('Area', `${f.ac} ac`)}${kv('Soil', f.soil)}${kv('Soil temp', T(f.st))}${kv('pH', String(f.ph))}${kv('Salinity', `${f.ec} mS/cm`)}${kv('Sensors', `${f.s[0]} of ${f.s[1]} online`)}${kv('Last watered', last ? `${last.d} · ${last.mm} mm` : 'Not this week')}</div>`;
  const body = `${hero}${spark(f)}${grid}<div class=nx><span class=mut>Recommended</span><br>${r ? r.t : 'Nothing to do right now'}.</div><div class=btns><button class='btn sm' data-act=go data-p=field>Log watering &amp; sensors</button><button class='btn alt sm' data-act=op data-id=${f.id}>Why this advice?</button></div>`;
  return mapCard('field', `Field ${fieldNo(f.id)} · ${f.name}`, body, { sum: `${f.m}% · ${WS[k].t}`, panel: 'field', cls: 'fcard' });
}

export function legendCard(layer: MapLayer): string {
  const items =
    layer === 'water'
      ? (['now', 'soon', 'rain', 'none'] as WaterState[]).map((w) => `<span class=lgi>${can(w, 22)}${WS[w].t}</span>`).join('')
      : `<span class=lgi>${LAYER_KEY[layer]}</span>`;
  const body = `${items}<span class=lgi>● Sensor online ○ offline · ┅ irrigation line</span><span class='lgi demo-chip' data-testid=demo-note>Demo map · simulated data</span>`;
  return mapCard('legend', 'Map key', body, { cls: 'lg' });
}

// ---- farm-wide summaries ---------------------------------------------------

export function todayCard(): string {
  const list = [...F].sort((a, b) => ORDER[ws(a)] - ORDER[ws(b)]);
  const n = list.filter((x) => ws(x) === 'now').length;
  const [on, total] = sensorsOnline();
  const avg = Math.round(F.reduce((a, x) => a + x.m * x.ac, 0) / totalAcres());
  const crit = openAlerts().filter((a) => a.l === 'cr').length;
  const kpi = (v: string, l: string, tone = '') => `<div class='kpi ${tone}'><b>${v}</b><span>${l}</span></div>`;
  const rows = list
    .map((x) => {
      const k = ws(x);
      return `<button class=mrow data-act=pk data-id=${x.id} aria-pressed=${x.id === S.sel}>${can(k, 24)}<span class=mrn>${x.name}<span class=mut> · ${x.crop}, ${x.ac} ac</span></span><span class=mrv style='color:${WS[k].c}'>${x.m}%</span></button>`;
    })
    .join('');
  const body = `<p class=kick>Good morning, ${esc(firstName())}</p><div class=kpis>${kpi(String(n), n === 1 ? 'field to water' : 'fields to water', n ? 'bad' : '')}${kpi(avg + '%', 'avg moisture')}${kpi(`${on}/${total}`, 'sensors online', on < total ? 'warn' : '')}${kpi(String(crit), 'critical alerts', crit ? 'bad' : '')}</div><div class='row tiny mut thead'><span>Field</span><span>Moisture</span></div>${rows}`;
  return mapCard('today', 'Farm overview', body, { sum: `${n} to water · ${on}/${total} sensors`, panel: 'dashboard' });
}

export function weatherCard(): string {
  const bars = W.map(
    (d) => `<div class=wc><b>${d.rain}%</b><div class=wb><i style='height:${Math.max(4, d.rain)}%'></i></div><b>${d.day.slice(0, 3)}</b><span>${T(d.temp)}</span></div>`,
  ).join('');
  const body = `<div class=wnow><span class=wt>${T(16)}</span><span>Sunny<br><span class=mut>${FARM.station}</span></span></div><div class='kvs g2'>${kv('Wind', '12 km/h W')}${kv('Humidity', '58%')}${kv('Rain, last 7 days', `${RT} mm`)}${kv('Next rain', `${W[1].day}, ${W[1].rain}%`)}</div><div class=spray><b>Spray window: good today</b><span class=mut>Wind under 15 km/h until about 4 pm. Rain from tomorrow.</span></div><div class='wk wk-sm'>${bars}</div><p class='mut tiny'>Rain tomorrow (6 mm) and Tuesday (14 mm). ${RT} mm fell last ${DN(64)}.</p>`;
  return mapCard('weather', 'Weather', body, { sum: `${T(16)} sunny · rain ${W[1].day.toLowerCase()} ${W[1].rain}%`, panel: 'weather' });
}

export function alertsCard(): string {
  const open = openAlerts();
  const items = open.length
    ? open
        .slice(0, 3)
        .map((a) => {
          const where = a.f ? `<button class=lnk data-act=pk data-id=${a.f}>${fld(a.f).name}</button> · ` : '';
          return `<div class=item><div style='flex:1'>${pill(a.l)} <b>${a.t}</b><div class='mut tiny'>${where}${a.ago}</div><div class=mut>${a.d}</div></div><button class='btn alt sm' data-act=dis data-aid=${a.id} aria-label='Dismiss ${a.t}'>✕</button></div>`;
        })
        .join('') + (open.length > 3 ? `<button class='btn alt sm' data-act=go data-p=alerts>See all ${open.length}</button>` : '')
    : '<p class=mut>Nothing needs your attention.</p>';
  const crit = open.filter((a) => a.l === 'cr').length;
  return mapCard('alerts', 'Alerts', items, { count: open.length, sum: crit ? `${crit} critical` : '', panel: 'alerts' });
}

export function actionsCard(): string {
  const todo = REC.filter((r) => r.p !== 'in' && !S.done[r.id]);
  const items = todo.length
    ? todo
        .slice(0, 3)
        .map(
          (r) =>
            `<div class=item>${can(ws(fld(r.f)), 24)}<div style='flex:1'><b>${r.t}</b><div class='mut tiny'>${fld(r.f).name} · ${r.p === 'cr' ? 'Today' : 'This week'}</div></div><button class='btn sm' data-act=done data-rid=${r.id}>Done</button></div>`,
        )
        .join('') + (todo.length > 3 ? `<button class='btn alt sm' data-act=go data-p=recs>See all ${todo.length}</button>` : '')
    : '<p class=mut>All caught up.</p>';
  return mapCard('recs', 'Work orders', items, { count: todo.length, sum: todo.length ? `next: ${todo[0].t.toLowerCase()}` : 'all done', panel: 'recs' });
}

// ---- top bar ---------------------------------------------------------------

export function topBar(): string {
  const [on, total] = sensorsOnline();
  const date = new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  const open = openAlerts().length;
  const crit = AL.some((a) => a.l === 'cr' && !S.dis[a.id]);
  return `<header class=topbar><div class=tb-brand>${can('now', 26, '#fff')}<span>Fieldwise</span></div><div class=tb-farm><b>${esc(S.farm)}</b><span>${FARM.location} · ${F.length} fields · ${totalAcres()} ac</span></div><div class=tb-wx><span><b>${T(16)}</b> Sunny</span><span>Wind 12 km/h</span><span>Humidity 58%</span><span>Rain tmrw ${W[1].rain}%</span></div><div class=tb-right><span class=tb-date>${date}</span><span class=tb-sync title='Simulated data'><i></i>${on}/${total} sensors · synced 2 min ago</span><button class='tb-btn${crit ? ' hot' : ''}' data-act=go data-p=alerts data-testid=top-alerts aria-label='${open} open alerts'>🔔<span class=badge>${open}</span></button><button class=tb-user data-act=me data-testid=top-profile aria-label='Farmer profile'><span class='av sm'>${esc(initials())}</span><span class=tb-un><b>${esc(S.name)}</b><span>${esc(S.role)}</span></span></button></div></header>`;
}
