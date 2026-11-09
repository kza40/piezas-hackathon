import { DEMO_ACCOUNTS } from '../seed/farmers';
import { FB, MET, W, WS } from '../seed/farm';
import { AL, DN, F, FH, HR, MI, MN, ownsSeedRef, REC, RT, SEN, fld, lastV } from '../seed/simulate';
import { S } from '../state';
import type { AlertFilter, Field, Level, WaterState } from '../types';
import { CROPS } from '../types';
import { SERIES_COLORS, chart, soil } from '../ui/charts';
import {
  demo,
  esc,
  fieldNo,
  firstName,
  idealRange,
  initials,
  isStation,
  metric,
  openAlerts,
  pill,
  rng,
  T,
  ws,
} from '../ui/helpers';
import { can, cropG } from '../ui/icons';
import { chipText, eventsCard, healthOf, healthPill, setupCard, triggerOf, triggerShort, wateringBlock } from './watering';

const ORDER: Record<WaterState, number> = { now: 0, soon: 1, rain: 2, none: 3 };
const byUrgency = () => [...F].sort((a, b) => ORDER[ws(a)] - ORDER[ws(b)]);
const sum = (fn: (f: Field) => number) => F.reduce((a, f) => a + fn(f), 0);

const fieldTabs = () =>
  `<div class=tabs role=group aria-label='Choose field'>${F.map(
    (x) => `<button aria-pressed=${x.id === S.sel} data-act=sel data-id=${x.id}>${fieldNo(x.id)}. ${esc(x.name)}</button>`,
  ).join('')}</div>`;

const feat = (f: Field) => {
  const k = ws(f);
  const b = FB[k];
  const advice = S.liveAdvice[f.id];
  const next = advice
    ? esc(advice.label) + (advice.reason ? ' · ' + esc(advice.reason) : '') + (advice.waterBy ? ' ' + esc(advice.waterBy.text) : '')
    : S.farmerId
      ? 'Advice loading…'
      : 'Check sensors and the forecast before you water.';
  const target = advice ? triggerShort(advice).toUpperCase() : `IDEAL ${f.mi[0]}–${f.mi[1]}%`;
  return `<section class=feat style='background:${b.bg};color:${b.fg}'><div class=ft><p class=fk>FIELD ${fieldNo(f.id)} — ${f.crop.toUpperCase()}</p><div class=fn style='color:${b.n}'>${f.m}<span>%</span></div><p class=fk>SOIL MOISTURE · ${target}</p><p class=chip style='background:${b.fg};color:${b.bg}'><i style='background:${WS[k].h}'></i>${esc(chipText(f, b.c))}</p><p class=fw>${next}</p><p class=fa><button class=btn style='background:${b.fg};color:${b.bg}' data-act=op data-id=${f.id}>Why?</button> <button class='btn alt' style='border-color:${b.fg};color:${b.fg}' data-act=pkm data-id=${f.id}>Show on map</button></p></div><div class=fr>${soil(f)}</div></section>`;
};

const tile = (f: Field) => {
  const k = ws(f);
  const b = FB[k];
  const outline = S.fd === f.id ? 'outline:4px solid #f0d6a0;outline-offset:3px' : '';
  return `<button class=tile data-act=sf data-id=${f.id} style='background:${b.bg};color:${b.fg};${outline}'><span class=ti>${fieldNo(f.id)}</span>${cropG(f.crop, 34)}<span class=tn style='color:${b.n}'>${f.m}%</span><span class=tl>${esc(f.name)}</span><span class=ts>${can(k, 30, b.fg)}${WS[k].t}</span></button>`;
};

/** Forecast hours grouped into the farmer's local days: total rain, average and lowest temperature. */
function byLocalDay(hours: { time: string; tempC: number; rainMm: number }[]) {
  const days = new Map<string, { label: string; rain: number; temp: number; low: number; n: number }>();
  for (const h of hours) {
    const d = new Date(h.time);
    const key = d.toLocaleDateString('en-CA'); // local YYYY-MM-DD
    const cur = days.get(key) ?? { label: d.toLocaleDateString('en', { weekday: 'short' }), rain: 0, temp: 0, low: Infinity, n: 0 };
    cur.rain += h.rainMm;
    cur.temp += h.tempC;
    cur.low = Math.min(cur.low, h.tempC);
    cur.n += 1;
    days.set(key, cur);
  }
  return [...days.values()];
}

const alertItems = (n: number) =>
  openAlerts()
    .slice(0, n)
    .map((a) => `<div class=item>${pill(a.l)}<div><b>${a.t}</b><div class=mut>${a.d}</div></div></div>`)
    .join('');

function authScene(): string {
  const trees = [70, 120, 175, 470, 530, 790, 850]
    .map((x, i) => `<g transform="translate(${x} ${268 + (i % 3) * 10})"><rect x="-3" y="8" width="6" height="30" fill="#5a4030"/><ellipse cx="0" cy="0" rx="18" ry="16" fill="#2f5a38"/><ellipse cx="-6" cy="-8" rx="10" ry="9" fill="#3d6b45"/></g>`)
    .join('');
  const rows = (x0: number, y0: number, w: number, n: number, color: string) =>
    Array.from({ length: n }, (_, i) => `<path d="M${x0} ${y0 + i * 8} Q${x0 + w / 2} ${y0 + i * 8 - 4} ${x0 + w} ${y0 + i * 8}" fill="none" stroke="${color}" stroke-width="2" opacity=".45"/>`).join('');
  return `<div class="login-scene" aria-hidden="true">
    <div class="sky"><i class="sun"></i><i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i></div>
    <div class="login-copy"><p class="login-kicker">Fieldwise</p><p class="login-headline">Know every acre.</p><p class="login-subcopy">Moisture, weather and watering advice on one farm map.</p></div>
    <svg class="login-land" viewBox="0 0 900 420" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a9a5e"/><stop offset="1" stop-color="#4f7340"/></linearGradient>
        <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4a36a"/><stop offset="1" stop-color="#8a6a3a"/></linearGradient>
        <linearGradient id="creek" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d7aaa"/><stop offset="1" stop-color="#5aa0c8"/></linearGradient>
      </defs>
      <path d="M0 70 C140 20 260 60 400 30 S680 10 900 55 L900 420 L0 420 Z" fill="#5a6d78"/>
      <path d="M0 110 C180 55 300 95 460 60 S720 40 900 95 L900 420 L0 420 Z" fill="url(#hill)"/>
      <path d="M30 160 L220 125 L390 155 L365 285 L55 295 Z" fill="#8fc47a" stroke="#1b2229" stroke-width="3"/>
      ${rows(55, 175, 280, 8, '#4f7340')}
      <path d="M410 145 L590 110 L760 150 L735 290 L430 300 Z" fill="#e6c15a" stroke="#1b2229" stroke-width="3"/>
      ${rows(440, 165, 270, 8, '#9a7a28')}
      <path d="M770 160 L880 140 L895 275 L785 295 Z" fill="#6f9a7c" stroke="#1b2229" stroke-width="3"/>
      <path d="M360 150 C420 210 430 250 420 320" fill="none" stroke="url(#creek)" stroke-width="14" stroke-linecap="round"/>
      <path d="M0 310 C220 275 420 330 620 295 S800 280 900 310 L900 420 L0 420 Z" fill="url(#soil)"/>
      <ellipse cx="820" cy="340" rx="52" ry="20" fill="#3d7aaa"/>
      <ellipse cx="808" cy="334" rx="16" ry="6" fill="#fff" opacity=".25"/>
      <g class="barn-draw"><rect x="610" y="195" width="100" height="62" fill="#8a4a32"/><path d="M598 195 L660 152 L722 195" fill="#3b2f2a"/><rect x="640" y="220" width="22" height="37" fill="#5a3020"/><rect x="720" y="205" width="24" height="52" fill="#c9c3b4"/><path d="M720 205 A12 10 0 0 1 744 205" fill="#a89f8e"/></g>
      ${trees}
      <g opacity=".9"><rect x="280" y="250" width="34" height="14" rx="2" fill="#c0392b"/><rect x="300" y="240" width="14" height="12" fill="#e8e1c8"/><circle cx="288" cy="266" r="7" fill="#222"/><circle cx="308" cy="266" r="6" fill="#222"/></g>
    </svg>
    <div class="grain"></div>
  </div>`;
}

export function login(): string {
  const signup = S.authMode === 'signup';
  const demos = DEMO_ACCOUNTS.map(
    (f) =>
      `<li><button type="button" class="demo-acc" data-act="fill" data-email="${esc(f.email)}" data-pass="${esc(f.password)}" data-testid="demo-${f.id}"><span class="demo-crop ${f.id}" aria-hidden="true"></span><span class="demo-copy"><b>${esc(f.name)}</b><span>${esc(f.farm)} · ${f.fields} fields</span><code>${esc(f.email)}</code></span></button></li>`,
  ).join('');
  const err = S.authError ? `<p class="auth-err" role="alert" data-testid="login-error">${esc(S.authError)}</p>` : '';
  const form = signup
    ? `<form data-act="signup" data-testid="signup-form"><label for="nm">Name <span class="mut">(optional)</span></label><input id="nm" name="name" type="text" autocomplete="name" maxlength="80" data-testid="signup-name" value=""><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="username" required data-testid="signup-email" value="${esc(S.authEmail)}"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="new-password" required minlength="10" data-testid="signup-password" value=""><p class="mut" style="margin:6px 0 0">At least 10 characters.</p>${err}<button class="btn login-go" type="submit" data-testid="signup-submit">Create my account</button></form><p class="mut" style="margin-top:14px">Already farming here? <button type="button" class="linkish" data-act="authmode" data-m="signin" data-testid="goto-signin">Sign in</button></p>`
    : `<form data-act="login" data-testid="login-form"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="username" required data-testid="login-email" value="${esc(S.authEmail)}"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required data-testid="login-password" value="">${err}<button class="btn login-go" type="submit" data-testid="login-submit">Sign in to my farm</button></form><p class="mut" style="margin-top:14px">New here? <button type="button" class="linkish" data-act="authmode" data-m="signup" data-testid="goto-signup">Create an account</button></p><p class="sub">Try a demo farm</p><ul class="demo-list">${demos}</ul><p class="login-note">Demo passwords: farm123-demo / oats456-demo · session is a cookie, not localStorage</p>`;
  return `<div class="login" data-testid="login-page">${authScene()}<div class="login-panel"><div class="login-card"><p class="login-brand">Fieldwise</p><h1>${signup ? 'Join the farm' : 'Open the farm gate'}</h1><p class="mut">${signup ? 'Create an account to start your own farm map.' : 'Sign in to see only the fields you own.'}</p>${form}</div></div></div>`;
}

export function dashboard(): string {
  if (!F.length) {
    return `${demo}<p class=kick>Welcome, ${esc(firstName())}</p><h1 class=mast>No farm yet.</h1><p class=mut>Create a farm with a map pin (latitude and longitude) from your profile, then add fields.</p><p><button class=btn data-act=go data-p=profile data-testid=empty-goto-profile>Set up my farm</button></p>`;
  }
  const Ls = byUrgency();
  if (!S.fd) S.fd = Ls[0].id;
  const f = fld(S.fd);
  const n = F.filter((x) => ws(x) === 'now').length;
  const open = openAlerts();
  const healthy = F.filter((x) => x.hl === 'ok').length;
  const avg = Math.round(sum((x) => x.m) / F.length);
  const liveWx = S.liveWeather;
  const weekDays = byLocalDay(liveWx?.hours ?? []).slice(0, 7);
  const weekBars = weekDays.length
    ? weekDays
        .map((d) => {
          const mm = Math.round(d.rain * 10) / 10;
          const pct = Math.min(100, Math.round(mm * 8));
          const temp = d.n ? d.temp / d.n : 0;
          return `<div class=wc><b>${mm}</b><div class=wb><i style='height:${Math.max(4, pct)}%'></i></div><b>${d.label}</b><span>${T(temp)}</span></div>`;
        })
        .join('')
    : W.map(
        (d) => `<div class=wc><b>${d.rain}%</b><div class=wb><i style='height:${Math.max(4, d.rain)}%'></i></div><b>${d.day}</b><span>${T(d.temp)}</span></div>`,
      ).join('');
  const wet = weekDays
    .map((d) => ({ label: d.label, mm: Math.round(d.rain * 10) / 10 }))
    .filter((d) => d.mm >= 1)
    .slice(0, 2);
  const weekNote = liveWx
    ? wet.length
      ? `Blue bars are mm of rain per day. Wettest: ${wet.map((d) => `${d.label} (${d.mm} mm)`).join(', ')}. ${liveWx.rainNext48hMm.toFixed(1)} mm expected in the next 48h.`
      : `Blue bars are mm of rain per day. ${liveWx.rainNext48hMm.toFixed(1)} mm expected in the next 48h.`
    : 'Blue bars show the chance of rain. Set a farm location to load your forecast.';
  return `${demo}<p class=kick>Good morning, ${esc(firstName())} · ${esc(S.farm)}</p><h1 class=mast>${n ? `Water ${n} field${n > 1 ? 's' : ''} today.` : 'Nothing to water today.'}</h1>${feat(f)}<h2 class=sh>All fields at a glance</h2><div class=tiles>${Ls.map(tile).join('')}</div><h2 class=sh>The week ahead</h2><div class='blk cream'><div class=wk>${weekBars}</div><p>${weekNote}</p></div><div class='grid g2' style='margin-top:14px'><div class='blk orange' style='margin:0'><h2>Needs you</h2>${alertItems(3)}<button class=btn data-act=go data-p=alerts>All ${open.length} alerts</button></div><div class='blk lime row' style='margin:0;justify-content:flex-start;gap:20px'><div class=ring style='background:conic-gradient(#1b2229 0 ${(healthy / F.length) * 100}%,rgba(6,33,15,.2) 0)'><b>${healthy}/${F.length}</b></div><div><h2>Fields healthy</h2><p>${F.filter((x) => x.hl !== 'ok')
    .map((x) => x.name)
    .join(', ')} need a look.</p></div></div></div><h2 class=sh>Fields &amp; sensors</h2><div class=row style='justify-content:flex-start;gap:24px'><div class=fn style='font-size:clamp(4rem,10vw,7rem);color:var(--g)'>${sum((x) => x.s[0])}<span>/${sum((x) => x.s[1])}</span></div><div><p>${sum((x) => x.s[0])} of ${sum((x) => x.s[1])} sensors reporting · average soil moisture ${avg}%.</p><button class='btn alt' data-act=go data-p=field>Open fields &amp; sensors</button></div></div>`;
}

const history = (f: Field) => {
  const k = S.mk;
  const met = metric(k);
  const station = isStation(k);
  const live = S.liveSensors[f.id];
  const adv = S.liveAdvice[f.id];
  const rows = (live?.length
    ? live.map((x, j) => {
        const a = x.ageHours;
        const v = station ? f[k] : k === 'm' ? x.m : k === 'st' ? x.st : k === 'ph' ? x.ph : null;
        const status =
          healthPill(healthOf(adv, x.id)) ??
          (a >= 24
            ? `<span class='pill cr'>▲ No readings for ${Math.round(a / 24)} days</span>`
            : a > 6
              ? `<span class='pill wn'>! Last reading ${a} h ago</span>`
              : `<span class='pill ok'>✓ Online</span>`);
        return `<tr><td><i style='display:inline-block;width:12px;height:12px;background:${station ? '#232a33' : SERIES_COLORS[j % 4]};margin-right:6px'></i>${esc(x.name)}</td><td>${status}</td><td>${v ?? '—'}${met.unit}</td></tr>`;
      })
    : S.farmerId
      ? []
      : SEN.filter((x) => x.f === f.layout).map((x, j) => {
        const a = x.age;
        const v = isStation(k) ? f[k] : lastV(x, k);
        const status =
          a >= 24
            ? `<span class='pill cr'>▲ No readings for ${Math.round(a / 24)} days</span>`
            : a > 6
              ? `<span class='pill wn'>! Last reading ${a} h ago</span>`
              : (lastV(x, 'm') ?? 0) < 20
                ? `<span class='pill wn'>! Reads dry</span>`
                : `<span class='pill ok'>✓ Online</span>`;
        return `<tr><td><i style='display:inline-block;width:12px;height:12px;background:${station ? '#232a33' : SERIES_COLORS[j % 4]};margin-right:6px'></i>${x.id}</td><td>${status}</td><td>${v ?? '—'}${met.unit}</td></tr>`;
      })
  ).join('');
  const note = S.liveHistory[f.id]
    ? `Each line is one sensor.${S.liveAdvice[f.id]?.setup.trigger ? ' The dashed line is your trigger.' : ''} Gaps mean no sensor data.`
    : 'Green band is the ideal range for the crop. Blue bars are rain. Red dots are odd readings we ignored. Gaps mean no data.';
  return `<div class=card><h3>${met.name}, last 7 days</h3><p class=mut>${note}</p>${chart(f, k)}</div><div class=card style='margin-top:14px'><h3>Sensors in ${esc(f.name)}</h3><table><tr><th>Sensor</th><th>Status</th><th>${station ? 'Field now' : met.name}</th></tr>${rows || '<tr><td colspan=3 class=mut>No sensors yet</td></tr>'}</table></div>`;
};

const waterLog = (f: Field) => {
  const L = S.log.filter((x) => x.f === f.id);
  return `<h2 class=sh>Watering log</h2><p>${[5, 10, 20].map((n) => `<button class='btn alt' data-act=lg data-mm=${n}>Log ${n} mm</button>`).join(' ')}</p><div class=card>${
    L.length
      ? L.map((x) => `<div class=item><b>${x.mm} mm</b><span class=mut>${esc(x.d)}</span></div>`).join('')
      : '<p class=mut>Nothing logged for this field yet. Tap a button when you water.</p>'
  }</div>`;
};

export function field(): string {
  if (!F.length) {
    return `${demo}<h1>Fields &amp; sensors</h1><p class=mut>No fields yet. Create a farm and add a field from your profile.</p><button class=btn data-act=go data-p=profile>Open profile</button>`;
  }
  const f = fld(S.sel);
  const r = S.farmerId ? null : REC.find((x) => x.f === f.id || x.f === f.layout);
  const liveA = S.liveAdvice[f.id];
  const tiles = MET.map((m) => {
    if (m.key === 'm' && liveA) {
      const t = triggerOf(f);
      const o = t == null ? triggerShort(liveA).toLowerCase() : f.m < t ? `below your ${t}% trigger` : `above your ${t}% trigger`;
      return `<div class='mt ${t != null && f.m < t ? 'off' : ''}'><div class=mv>${f.m}<small>%</small></div><b>${m.name}</b><span class=mtnote>${o}</span></div>`;
    }
    const rg = idealRange(f, m);
    const v = f[m.key];
    const o = v < rg[0] ? 'low' : v > rg[1] ? 'high' : 'in range';
    const temp = m.unit === '°C';
    return `<div class='mt ${o === 'in range' ? '' : 'off'}'><div class=mv>${temp ? T(v) : v}<small>${temp ? '' : m.unit}</small></div><b>${m.name}</b>${rng(v, rg)}<span>${o}</span></div>`;
  }).join('');
  const live = S.liveAdvice[f.id];
  const rec = live
    ? wateringBlock(f, live) + setupCard(f, live)
    : r
      ? `<div class='blk orange'><h2>Recommended action</h2><p><b>${r.t}</b></p><p>${r.w}</p><p>${r.c}</p></div>`
      : `<div class='blk lime'><h2>Recommended action</h2><p class=mut>Advice loading…</p></div>`;
  const metricTabs = MET.map((m) => `<button aria-pressed=${m.key === S.mk} data-act=mk data-k=${m.key}>${m.name}</button>`).join('');
  return `${demo}<h1>Fields &amp; sensors</h1><p class=mut>Readings, history and watering for each parcel — in one place.</p><p><button class='btn alt sm' data-act=export data-testid=export-csv>Download last 14 days (CSV)</button></p>${fieldTabs()}${feat(f)}<h2 class=sh>Readings against the ideal</h2><div class=mgrid>${tiles}</div>${rec}<h2 class=sh>Sensor history</h2><div class=tabs>${metricTabs}</div>${history(f)}${live ? eventsCard(f, live) : waterLog(f)}`;
}

export function weather(): string {
  const live = S.liveWeather;
  if (!live) {
    return `${demo}<h1>Weather and your fields</h1><p class=mut>Sign in and set a farm location to load the forecast.</p>`;
  }
  const now = live.hours[0];
  // One card per local day of the forecast (a whole day's rain and its low, not one hour's reading).
  const dayCards = byLocalDay(live.hours)
    .slice(0, 7)
    .map(
      (d) =>
        `<div class="day"><b>${d.label}</b><div class="big" style="font-size:1.3rem">${T(Math.round((d.temp / d.n) * 10) / 10)}</div><div>low ${T(d.low)}</div><div>${d.rain.toFixed(1)} mm</div></div>`,
    )
    .join('');
  const frost = live.overnightLowC <= 2
    ? `Frost risk: overnight low ${T(live.overnightLowC)}.`
    : `No hard frost expected. Overnight low ${T(live.overnightLowC)}.`;
  return `${demo}<h1>Weather and your fields</h1><div class='grid g2' style='margin:14px 0'><div class='blk cream' style='margin:0'><h3>Next 48 hours</h3><p>Rain: ${live.rainNext48hMm.toFixed(1)} mm<br>${frost}</p></div><div class='blk lime' style='margin:0'><h3>Now</h3><p>${now ? T(now.tempC) : '—'} · ${now ? `${now.rainMm.toFixed(1)} mm this hour` : '—'}</p></div></div><div class="card"><div class="big">${now ? T(now.tempC) : '—'}</div><p class="mut">Farm forecast · ${live.rainNext48hMm.toFixed(1)} mm rain in 48h</p></div>
<h2 style="margin:18px 0 8px">Ahead</h2><div class="days">${dayCards}</div>
<div class="card" style="margin-top:14px"><h3>What this means for your fields</h3>${F.map((f) => {
  const a = S.liveAdvice[f.id];
  return a ? `<div class="item"><div>${pill(a.label === 'Water today' ? 'cr' : 'ok')}</div><div><b>${esc(f.name)}</b> — ${esc(a.label)}. ${esc(a.reason)}</div></div>` : '';
}).join('') || '<p class=mut>Advice loads with your fields.</p>'}</div>`;
}

export function recs(): string {
  if (S.farmerId) {
    const cards = F.map((field) => {
      const a = S.liveAdvice[field.id];
      if (!a) return '';
      return `<div class="card" style="margin-bottom:12px"><div class="row"><div style="display:flex;gap:8px;align-items:center">${can(ws(field), 34)}${pill(a.label === 'Water today' ? 'cr' : a.label === 'Wait' ? 'wn' : 'ok')}</div><button class="btn alt" data-act="go" data-p="field" data-id="${field.id}">${esc(field.name)}</button></div><h2 style="margin:8px 0">${esc(a.label)}</h2><p>${esc(a.reason)}</p>${a.soilWarning ? `<p class="mut">${esc(a.soilWarning)}</p>` : ''}${a.frostWarning ? `<p class="mut">${esc(a.frostWarning)}</p>` : ''}</div>`;
    }).join('');
    return `${demo}<h1>Recommended actions</h1><p class="mut">From live advice for each field.</p>${cards || '<p class=mut>No advice yet — check sensors and farm location.</p>'}`;
  }
  const cards = REC.filter((r) => ownsSeedRef(r.f)).map((r) => {
    const field = F.find((f) => f.id === r.f || f.layout === r.f) ?? fld(r.f);
    const done = !!S.done[r.id];
    const actions = done
      ? '<span class="pill ok">✓ Marked done</span>'
      : `<button class="btn" data-act="done" data-rid="${r.id}">Mark as done</button>`;
    return `<div class="card" style="margin-bottom:12px"><div class="row"><div style="display:flex;gap:8px;align-items:center">${can(ws(field), 34)}${pill(r.p === 'in' ? 'ok' : r.p)}</div><button class="btn alt" data-act="go" data-p="field" data-id="${field.id}">${esc(field.name)}</button></div><h2 style="margin:8px 0">${done ? '<s>' + r.t + '</s>' : r.t}</h2><p>${r.w}</p><p class="mut">${r.c}</p>${actions}</div>`;
  }).join('');
  return `${demo}<h1>Recommended actions</h1><p class="mut">Ordered by how soon each one matters.</p>${cards}`;
}

export function alerts(): string {
  if (S.farmerId) {
    const rows = S.liveAlerts;
    const list = rows.length
      ? rows
          .map((a) => {
            const field = F.find((f) => f.id === a.fieldId);
            const when = new Date(a.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            return `<div class="card" style="margin-bottom:10px"><div class="row">${pill('wn')}<button class="btn alt" data-act="dis" data-aid="${a.id}">Mark done</button></div><h2 style="margin:8px 0 4px">Watering alert</h2><p>${esc(a.message)}</p><p class="mut">${field ? esc(field.name) + ' · ' : ''}${when}</p></div>`;
          })
          .join('')
      : '<p class=mut>Nothing needs your attention.</p>';
    return `${demo}<h1>Alerts</h1><p class="mut">Open alerts from the advice engine.</p>${list}`;
  }
  const L = AL.filter((a) => !S.dis[a.id] && (S.flt === 'all' || a.l === S.flt) && ownsSeedRef(a.f));
  const list = L.map((a) => {
    const field = a.f ? F.find((f) => f.id === a.f || f.layout === a.f) : null;
    return `<div class="card" style="margin-bottom:10px"><div class="row">${pill(a.l)}<button class="btn alt" data-act="dis" data-aid="${a.id}">Dismiss</button></div><h2 style="margin:8px 0 4px">${a.t}</h2><p>${a.d}</p><p class="mut">${field ? esc(field.name) + ' · ' : ''}${a.ago}</p></div>`;
  }).join('');
  return `${demo}<h1>Alerts</h1>${list || '<p class=mut>Nothing needs your attention.</p>'}`;
}

export function settings(): string {
  const notify = ['Critical alerts', 'Warnings', 'Daily summary']
    .map(
      (t, i) =>
        `<div class="row item"><label for="n${i}" style="margin:0">${t}</label><input id="n${i}" type="checkbox" style="width:24px;height:24px" ${i < 2 ? 'checked' : ''}></div>`,
    )
    .join('');
  const sensors = F.map(
    (f) =>
      `<tr><td>${esc(f.name)}</td><td>${f.s[0]} of ${f.s[1]}</td><td><button class="btn alt" data-act="say" data-t="Pairing is not available in this demo">Add sensor</button></td></tr>`,
  ).join('');
  return `${demo}<h1>Settings</h1><div class="stack"><div class="card"><h3>Farm</h3><label for="fn2">Farm name</label><input id="fn2" data-bind="farm" value="${esc(S.farm)}"><label for="un">Temperature units</label><select id="un" data-bind="units"><option ${S.units === '°C' ? 'selected' : ''}>°C</option><option ${S.units === '°F' ? 'selected' : ''}>°F</option></select><p><button class="btn" data-act="say" data-t="Settings saved">Save changes</button></p></div>
<div class="card"><h3>Notifications</h3>${notify}</div>
<div class="card"><h3>Sensors</h3><table><tr><th>Field</th><th>Online</th><th></th></tr>${sensors}</table></div><p><button class="btn alt" data-act="out" data-testid="settings-sign-out">Sign out</button></p></div>`;
}

export function profile(): string {
  const roles = ['Owner', 'Farm manager', 'Field worker'].map((r) => `<option ${r === S.role ? 'selected' : ''}>${r}</option>`).join('');
  const fields = F.map((x) => {
    const slug = x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || x.id.slice(0, 8);
    return `<div class=field-row data-testid=field-row-${slug}><button class=lb data-act=pkm data-id=${x.id}><span>${esc(x.name)} <span class=mut>· ${x.crop} · ${x.ac} ac</span></span>${pill(x.hl)}</button><button class='btn alt sm' data-act=rmf data-id=${x.id} data-testid=delete-field-${slug} aria-label='Remove ${esc(x.name)}'>Remove</button></div>`;
  }).join('');
  const cropOpts = CROPS.map((c) => `<option value="${c}">${c}</option>`).join('');
  const farmForm = S.farmId
    ? `<p class=mut>Farm location for weather: ${S.farmLat ?? '—'}, ${S.farmLng ?? '—'}</p>`
    : `<div class=add-field data-testid=create-farm-form><h3>Create your farm</h3><p class=mut>Weather needs a map pin. Use approximate county coordinates if you are unsure.</p><label for=cfn>Farm name</label><input id=cfn placeholder="Willow Creek Farm" data-testid=create-farm-name value="${esc(S.farm)}"><label for=clat>Latitude</label><input id=clat type=number step=0.0001 placeholder="e.g. 49.05" required data-testid=create-farm-lat><label for=clng>Longitude</label><input id=clng type=number step=0.0001 placeholder="e.g. -122.30" required data-testid=create-farm-lng><button class=btn type=button data-act=cf data-testid=create-farm-submit>Create farm</button></div>`;
  const add = S.farmId
    ? `<div class=add-field data-testid=add-field-form><h3>Add a field</h3><p class=mut>Saved on the server. New parcels show on your map with demo sensors until real ones are wired.</p><label for=afn>Field name</label><input id=afn placeholder="South pasture" data-testid=add-field-name><label for=afc>Crop</label><select id=afc data-testid=add-field-crop>${cropOpts}</select><label for=afa>Acres</label><input id=afa type=number min=1 max=500 step=1 value=40 data-testid=add-field-acres><button class=btn type=button data-act=af data-testid=add-field-submit>Add field to my farm</button></div>`
    : '';
  return `${demo}<h1>Your profile</h1><div class='grid g2'><div class=card><div class=row style='justify-content:flex-start;gap:16px'><div class=av>${esc(initials())}</div><div><h2>${esc(S.name)}</h2><span class=mut>${esc(S.role)} · ${esc(S.farm || 'No farm yet')}</span></div></div><label for=pn>Your name</label><input id=pn data-bind=name value="${esc(S.name)}" data-testid=profile-name><label for=pp>Phone</label><input id=pp data-bind=phone value="${esc(S.phone)}" data-testid=profile-phone><label for=pf>Farm name</label><input id=pf data-bind=farm value="${esc(S.farm)}" ${S.farmId ? 'disabled' : ''}><label for=pr>Your role</label><select id=pr data-bind=role>${roles}</select>${farmForm}<p><button class=btn data-act=savep data-testid=save-profile>Save profile</button></p></div><div class=card data-testid=my-fields><h3>My fields (${F.length})</h3><p class=mut>Open a field on the map, or remove it from your farm.</p><div class=field-list>${fields || '<p class=mut>No fields yet. Add one below.</p>'}</div>${add}<p style='margin-top:14px'><button class='btn alt' data-act=go data-p=settings>Notifications and sensors</button> <button class='btn alt' data-act=out>Sign out</button></p></div></div>`;
}

export function wateringModal(f: Field): string {
  const k = ws(f);
  const w = WS[k];
  const [lo, hi] = f.mi;
  const live = S.liveAdvice[f.id];
  const why: Record<WaterState, string> = {
    now: `Soil is at ${f.m}%, below the ${lo}–${hi}% ${f.crop.toLowerCase()} needs.`,
    soon: `Moisture is fine at ${f.m}%, but the soil is warm (${T(f.st)}) and will dry out fast.`,
    rain: `Moisture is ${f.m}%, just under range, with rain likely soon.`,
    none: `Moisture is ${f.m}%, inside the ${lo}–${hi}% range.`,
  };
  const next: Record<WaterState, string> = {
    now: 'Water lightly today, then check again tonight.',
    soon: 'Check this field this afternoon. Water this evening if moisture keeps dropping.',
    rain: 'Hold off if rain is still expected.',
    none: 'Nothing to do right now.',
  };
  const wx = S.liveWeather
    ? `${S.liveWeather.rainNext48hMm.toFixed(1)} mm rain next 48h · overnight ${T(S.liveWeather.overnightLowC)}`
    : 'Forecast loads with your farm location.';
  const whyText = live?.reason ?? why[k];
  const nextText = live ? live.label + (live.waterBy ? ` · ${live.waterBy.text}` : '') : next[k];
  const target = live
    ? `<div class=mut>${esc(triggerShort(live))}${live.setup.trigger ? ' · water when the driest trusted probe drops below it' : ''}</div>`
    : `${rng(f.m, f.mi)}<div class=mut>Recommended for ${f.crop.toLowerCase()}: ${lo}–${hi}%</div>`;
  return `<div class=mdl data-act=cm><div class=sheet role=dialog aria-modal=true aria-label='Watering details' style='border-top-color:${w.h}'><div class=row><div style='display:flex;gap:12px;align-items:center'>${can(k, 60)}<div><h2>${esc(f.name)}</h2><b style='color:${w.c};font-size:1.15rem'>${w.t}</b></div></div><button class='btn alt' data-act=cm>Close</button></div><div class=item style='display:block'><div class=row><span>Soil moisture now</span><b>${f.m}%</b></div>${target}</div><p><b>Weather:</b> ${wx}</p><p><b>Why:</b> ${esc(whyText)}</p><div class=nx><span class=mut>Next step</span><br>${esc(nextText)}</div><p style='margin-top:14px'><button class=btn data-act=gf data-id=${f.id}>Open field details</button></p></div></div>`;
}

