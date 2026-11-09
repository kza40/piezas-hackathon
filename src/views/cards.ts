import { FARM, FB, W, WS } from '../seed/farm';
import { DN, F, ownsSeedRef, REC, RT, SEN, fld, sensorsOf } from '../seed/simulate';
import { S } from '../state';
import type { CardId, Field, MapLayer, PanelId, WaterState } from '../types';
import { esc, fieldNo, firstName, initials, lastWatered, moistureTint, openAlerts, pill, T, ws } from '../ui/helpers';
import { can } from '../ui/icons';
import { chipText, healthOf, lastWateredText, triggerShort } from './watering';

const mine = <T extends { f: string }>(rows: T[]) => rows.filter((r) => ownsSeedRef(r.f));
const recFor = (f: Field) => (S.farmerId ? undefined : mine(REC).find((q) => q.f === f.id || q.f === f.layout));
const fieldForSeed = (ref: string) => F.find((f) => f.id === ref || f.layout === ref) ?? fld(ref);

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
  const body = `<div class=prof><span class=av>${esc(initials())}</span><div><b class=pnm>${esc(S.name)}</b><div class='mut tiny'>${esc(S.role)} · ${esc(S.farm || 'No farm yet')}</div></div></div><div class='kvs g2'>${kv('Phone', S.phone || '—')}${kv('Watering logged', `${S.log.filter((x) => F.some((f) => f.id === x.f)).length} this week`)}${kv('Email', esc(S.email || '—'))}${kv('Alerts', 'Critical alerts')}</div><div class=btns><button class='btn sm' data-act=go data-p=profile>Edit profile</button><button class='btn alt sm' data-act=go data-p=settings>Settings</button><button class='btn alt sm' data-act=out data-testid=sign-out>Sign out</button></div>`;
  return mapCard('profile', 'Farmer profile', body, { sum: `${esc(S.name)} · ${esc(S.role)}`, panel: 'profile', cls: 'pcard' });
}

// ---- selected field --------------------------------------------------------

/** Field average of the sensors that are still reporting, one point every 3 hours. */
function moistureHistory(f: Field): number[] {
  const series = S.liveMoistureSeries[f.id];
  if (series?.length) return series;
  if (S.farmerId) return [];
  const live = SEN.filter((s) => s.f === f.layout && s.age <= 6);
  const out: number[] = [];
  for (let t = 0; t < 168; t += 3) {
    const v = live.map((s) => s.vals.m[t]).filter((x, i): x is number => x != null && !live[i].gl.m.has(t));
    if (v.length) out.push(v.reduce((a, b) => a + b, 0) / v.length);
  }
  return out;
}

function spark(f: Field): string {
  const h = moistureHistory(f);
  if (!h.length) return "<p class='mut tiny'>Moisture history loads with your sensors.</p>";
  const a = S.liveAdvice[f.id];
  const trig = a?.setup.irrigated ? (a.setup.trigger?.value ?? null) : null;
  const marks = a ? (trig != null ? [trig] : []) : f.mi;
  const lo = Math.min(...h, ...marks) - 3;
  const hi = Math.max(...h, ...marks) + 3;
  const y = (v: number) => 54 - ((v - lo) / (hi - lo)) * 50;
  const x = (i: number) => (i / Math.max(1, h.length - 1)) * 300;
  const pts = h.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const band = a
    ? trig != null
      ? `<line x1=0 x2=300 y1=${y(trig).toFixed(1)} y2=${y(trig).toFixed(1)} stroke='#c0522b' stroke-width=1.6 stroke-dasharray='5 4' vector-effect=non-scaling-stroke />`
      : ''
    : `<rect x=0 y=${y(f.mi[1]).toFixed(1)} width=300 height=${(y(f.mi[0]) - y(f.mi[1])).toFixed(1)} fill='#4f8a63' fill-opacity=.16 />`;
  const key = a ? (trig != null ? `Dashed line: your ${trig}% trigger` : triggerShort(a)) : `Ideal ${f.mi[0]}–${f.mi[1]}% shaded`;
  return `<svg class=spark viewBox='0 0 300 58' preserveAspectRatio=none role=img aria-label='Soil moisture, last 7 days'>${band}<polyline points='${pts}' fill=none stroke='#3d5f8f' stroke-width=2.2 vector-effect=non-scaling-stroke /><circle cx=${x(h.length - 1)} cy=${y(h[h.length - 1])} r=3.5 fill='#3d5f8f'/></svg><div class='row mut tiny'><span>${DN(0)}</span><span>${key}</span><span>Now</span></div>`;
}

export function fieldCard(): string {
  const f = fld(S.sel);
  const k = ws(f);
  const look = FB[k];
  const h = moistureHistory(f);
  const d24 = h.length >= 9 ? Math.round((h[h.length - 1] - h[h.length - 9]) * 10) / 10 : null;
  const trend = d24 == null ? 'no 24 h trend yet' : `<span class=trend>${d24 > 0 ? '▲' : d24 < 0 ? '▼' : '■'} ${Math.abs(d24)} pts / 24 h</span>`;
  const a = S.liveAdvice[f.id];
  const r = recFor(f);
  const posts = sensorsOf(f.id);
  const live = posts.filter((s) => s.m != null).map((s) => s.m!);
  const span = live.length ? `${Math.round(Math.min(...live))}–${Math.round(Math.max(...live))}%` : `${f.m}%`;
  const zones = posts
    .map((s) => {
      const tone = s.m == null ? '#b8b2a2' : moistureTint(s.m);
      const flag = s.sensorId ? healthOf(a, s.sensorId) : undefined;
      const state = flag ? `<em class=zchk title='${esc(flag.reason ?? '')}'>check sensor</em>` : `<em class=mut>${s.online ? 'live' : `${s.age}h ago`}</em>`;
      return `<div class=zrow><i style='background:${tone}'></i><b>${esc(s.id)}</b><span>${s.m == null ? '—' : `${Math.round(s.m)}%`}</span>${state}</div>`;
    })
    .join('');
  const hero = `<div class=fhero style='background:${look.bg};color:${look.fg}'><div><div class=fn style='color:${look.n}'>${f.m}<span>%</span></div><div class=fsub>Soil moisture · ${trend}</div></div><button class=cb data-act=op data-id=${f.id} aria-label='Watering details'>${can(k, 48)}</button><p class=chip style='background:${look.fg};color:${look.bg}'><i style='background:${WS[k].h}'></i>${esc(chipText(f, look.c))}</p></div>`;
  const grid = `<div class='kvs g2'>${kv('Crop', `${f.crop} · ${esc(f.stage)}`)}${kv('Area', `${f.ac} ac`)}${kv('Soil', esc(f.soil))}${kv('Air humidity', `${f.h}%`)}${kv('Soil temp', T(f.st))}${kv('pH', String(f.ph))}${kv('Last watered', a ? lastWateredText(a) : lastWatered(f.id))}${kv('Across field', span)}</div>`;
  const body = `${hero}${spark(f)}${grid}<p class=sub>Moisture by area</p><div class=zrows>${zones}</div><div class=nx><span class=mut>Recommended action</span><br>${a ? esc(a.label) : r ? r.t : 'No action needed right now'}${a?.waterBy ? `<div class=wby>${esc(a.waterBy.text)}</div>` : ''}${a?.reason ? `<div class='mut tiny'>${esc(a.reason)}</div>` : ''}</div><div class=btns><button class='btn sm' data-act=go data-p=field data-id=${f.id} data-testid=open-field-panel>Open field &amp; sensors</button><button class='btn alt sm' data-act=op data-id=${f.id}>Why this advice?</button></div>`;
  return mapCard('field', `Field ${fieldNo(f.id)} · ${esc(f.name)}`, body, { sum: `${f.m}% · ${esc(a?.label ?? WS[k].t)}`, panel: 'field', cls: 'fcard' });
}

export function legendCard(layer: MapLayer): string {
  const items =
    layer === 'water'
      ? (['now', 'soon', 'rain', 'none'] as WaterState[]).map((w) => `<span class=lgi>${can(w, 22)}${WS[w].t}</span>`).join('')
      : `<span class=lgi>${LAYER_KEY[layer]}</span>`;
  const body = `${items}<span class=lgi>● Sensor online ○ offline · ┅ irrigation line</span><span class=lgi><span class=mlg></span> Moisture map: brown = dry, blue = wet</span><span class='lgi demo-chip' data-testid=demo-note>Demo map · simulated data</span>`;
  return mapCard('legend', 'Map key', body, { cls: 'lg' });
}

// ---- farm-wide summaries ---------------------------------------------------

export function todayCard(): string {
  const list = [...F].sort((a, b) => ORDER[ws(a)] - ORDER[ws(b)]);
  const n = list.filter((x) => ws(x) === 'now').length;
  const [on, total] = sensorsOnline();
  const avg = totalAcres() ? Math.round(F.reduce((a, x) => a + x.m * x.ac, 0) / totalAcres()) : 0;
  const crit = openAlerts().filter((a) => a.l === 'cr').length;
  const kpi = (v: string, l: string, tone = '') => `<div class='kpi ${tone}'><b>${v}</b><span>${l}</span></div>`;
  const rows = list
    .map((x) => {
      const k = ws(x);
      return `<button class=mrow data-act=pk data-id=${x.id} aria-pressed=${x.id === S.sel}>${can(k, 24)}<span class=mrn>${esc(x.name)}<span class=mut> · ${x.crop}, ${x.ac} ac</span></span><span class=mrv style='color:${WS[k].c}'>${x.m}%</span></button>`;
    })
    .join('');
  const body = `<p class=kick>Good morning, ${esc(firstName())}</p><div class=kpis>${kpi(String(n), n === 1 ? 'field to water' : 'fields to water', n ? 'bad' : '')}${kpi(avg + '%', 'avg moisture')}${kpi(`${on}/${total}`, 'sensors online', on < total ? 'warn' : '')}${kpi(String(crit), 'critical alerts', crit ? 'bad' : '')}</div><div class='row tiny mut thead'><span>Field</span><span>Moisture</span></div>${rows}`;
  return mapCard('today', 'Farm overview', body, { sum: `${n} to water · ${on}/${total} sensors`, panel: 'dashboard' });
}

export function weatherCard(): string {
  const live = S.liveWeather;
  if (!live) {
    return mapCard('weather', 'Weather', '<p class=mut>Weather loads from your farm location after sign-in.</p>', { sum: 'Waiting for farm weather', panel: 'weather' });
  }
  const now = live.hours[0];
  const nextRain = live.hours.find((h) => h.rainMm > 0.2);
  const bars = live.hours.slice(0, 8).map((h) => {
    const label = new Date(h.time).toLocaleTimeString('en', { hour: 'numeric' });
    const pct = Math.min(100, Math.round(h.rainMm * 20));
    return `<div class=wc><b>${h.rainMm.toFixed(1)}</b><div class=wb><i style='height:${Math.max(4, pct)}%'></i></div><b>${label}</b><span>${T(h.tempC)}</span></div>`;
  }).join('');
  const body = `<div class=wnow><span class=wt>${now ? T(now.tempC) : '—'}</span><span>Next 48h rain<br><span class=mut>${live.rainNext48hMm.toFixed(1)} mm</span></span></div><div class='kvs g2'>${kv('Overnight low', T(live.overnightLowC))}${kv('Rain next 48h', `${live.rainNext48hMm.toFixed(1)} mm`)}${kv('Next rain hour', nextRain ? new Date(nextRain.time).toLocaleString('en', { weekday: 'short', hour: 'numeric' }) : 'None soon')}${kv('Source', 'Farm forecast')}</div><div class='wk wk-sm'>${bars}</div><p class='mut tiny'>Live forecast for your farm pin.</p>`;
  return mapCard('weather', 'Weather', body, { sum: `${live.rainNext48hMm.toFixed(1)} mm / 48h · low ${T(live.overnightLowC)}`, panel: 'weather' });
}

export function alertsCard(): string {
  if (S.farmerId) {
    const open = S.liveAlerts;
    const items = open.length
      ? open.slice(0, 3).map((a) => {
          const field = F.find((f) => f.id === a.fieldId);
          const where = field ? `<button class=lnk data-act=pk data-id=${field.id}>${esc(field.name)}</button> · ` : '';
          const when = new Date(a.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return `<div class=item><div style='flex:1'>${pill('wn')} <b>Watering alert</b><div class='mut tiny'>${where}${when}</div><div class=mut>${esc(a.message)}</div></div><button class='btn alt sm' data-act=dis data-aid=${a.id} aria-label='Mark alert done'>✕</button></div>`;
        }).join('') + (open.length > 3 ? `<button class='btn alt sm' data-act=go data-p=alerts>See all ${open.length}</button>` : '')
      : '<p class=mut>Nothing needs your attention.</p>';
    return mapCard('alerts', 'Alerts', items, { count: open.length, sum: open.length ? `${open.length} open` : '', panel: 'alerts' });
  }
  const open = openAlerts();
  const items = open.length
    ? open.slice(0, 3).map((a) => {
        const field = a.f ? fieldForSeed(a.f) : null;
        const where = field?.id ? `<button class=lnk data-act=pk data-id=${field.id}>${esc(field.name)}</button> · ` : '';
        return `<div class=item><div style='flex:1'>${pill(a.l)} <b>${a.t}</b><div class='mut tiny'>${where}${a.ago}</div><div class=mut>${a.d}</div></div><button class='btn alt sm' data-act=dis data-aid=${a.id} aria-label='Dismiss ${a.t}'>✕</button></div>`;
      }).join('') + (open.length > 3 ? `<button class='btn alt sm' data-act=go data-p=alerts>See all ${open.length}</button>` : '')
    : '<p class=mut>Nothing needs your attention.</p>';
  const crit = open.filter((a) => a.l === 'cr').length;
  return mapCard('alerts', 'Alerts', items, { count: open.length, sum: crit ? `${crit} critical` : '', panel: 'alerts' });
}

// ---- top bar ---------------------------------------------------------------

export function topBar(): string {
  const [on, total] = sensorsOnline();
  const date = new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  const open = openAlerts().length;
  const crit = openAlerts().some((a) => a.l === 'cr');
  const place =
    S.farmLat != null && S.farmLng != null ? `${S.farmLat.toFixed(2)}°, ${S.farmLng.toFixed(2)}°` : S.farm ? 'Your farm' : 'No farm yet';
  return `<header class=topbar data-testid=topbar><div class=tb-brand>${can('now', 18, '#fff')}<span>Fieldwise</span></div><div class=tb-farm><b>${esc(S.farm || 'No farm yet')}</b><span>${esc(place)} · ${F.length} fields · ${totalAcres()} ac</span></div><div class=tb-wx data-testid=top-weather>${S.liveWeather ? `<span>${S.liveWeather.rainNext48hMm.toFixed(1)} mm rain / 48h</span><span class=mut>low ${T(S.liveWeather.overnightLowC)}</span>` : `<span class=mut>Weather loads from your farm location</span>`}</div><div class=tb-right><span class=tb-date>${date}</span><span class=tb-sync title='Live farm data'><i></i>${on}/${total} sensors online</span><button class='tb-btn${crit ? ' hot' : ''}' data-act=go data-p=alerts data-testid=top-alerts aria-label='${open} open alerts'>🔔<span class=badge>${open}</span></button><button class=tb-user data-act=me data-testid=top-profile aria-label='Farmer profile'><span class='av sm'>${esc(initials())}</span><span class=tb-un><b>${esc(S.name)}</b><span>${esc(S.role)}</span></span></button></div></header>`;
}
