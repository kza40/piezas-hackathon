import { FB, MET, NXT, W, WS } from '../seed/farm';
import { AL, DN, F, FH, HR, MI, MN, REC, RT, SEN, fld, lastV } from '../seed/simulate';
import { S } from '../state';
import type { AlertFilter, Field, Level, WaterState } from '../types';
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

const ORDER: Record<WaterState, number> = { now: 0, soon: 1, rain: 2, none: 3 };
const byUrgency = () => [...F].sort((a, b) => ORDER[ws(a)] - ORDER[ws(b)]);
const sum = (fn: (f: Field) => number) => F.reduce((a, f) => a + fn(f), 0);

const fieldTabs = () =>
  `<div class=tabs role=group aria-label='Choose field'>${F.map(
    (x) => `<button aria-pressed=${x.id === S.sel} data-act=sel data-id=${x.id}>${x.id}. ${x.name}</button>`,
  ).join('')}</div>`;

const feat = (f: Field) => {
  const k = ws(f);
  const b = FB[k];
  return `<section class=feat style='background:${b.bg};color:${b.fg}'><div class=ft><p class=fk>FIELD ${fieldNo(f.id)} — ${f.crop.toUpperCase()}</p><div class=fn style='color:${b.n}'>${f.m}<span>%</span></div><p class=fk>SOIL MOISTURE · IDEAL ${f.mi[0]}–${f.mi[1]}%</p><p class=chip style='background:${b.fg};color:${b.bg}'><i style='background:${WS[k].h}'></i>${b.c}</p><p class=fw>${NXT[k]}</p><p class=fa><button class=btn style='background:${b.fg};color:${b.bg}' data-act=op data-id=${f.id}>Why?</button> <button class='btn alt' style='border-color:${b.fg};color:${b.fg}' data-act=pkm data-id=${f.id}>Show on map</button></p></div><div class=fr>${soil(f)}</div></section>`;
};

const tile = (f: Field) => {
  const k = ws(f);
  const b = FB[k];
  const outline = S.fd === f.id ? 'outline:4px solid #f0d6a0;outline-offset:3px' : '';
  return `<button class=tile data-act=sf data-id=${f.id} style='background:${b.bg};color:${b.fg};${outline}'><span class=ti>${fieldNo(f.id)}</span>${cropG(f.crop, 34)}<span class=tn style='color:${b.n}'>${f.m}%</span><span class=tl>${f.name}</span><span class=ts>${can(k, 30, b.fg)}${WS[k].t}</span></button>`;
};

const alertItems = (n: number) =>
  openAlerts()
    .slice(0, n)
    .map((a) => `<div class=item>${pill(a.l)}<div><b>${a.t}</b><div class=mut>${a.d}</div></div></div>`)
    .join('');

export function login(): string {
  return `<div style="max-width:440px;margin:6vh auto" class="card">${demo}<h1>Set up your farm</h1><p class="mut">You can change this later in Settings.</p><label for="fn">Farm name</label><input id="fn" data-bind="farm" value="${esc(S.farm)}"><label for="cr">Main crop</label><select id="cr"><option>Wheat</option><option>Canola</option><option>Barley</option></select><label>Sensors</label><p class="mut">We’ll show ${SEN.length} demo sensors across ${F.length} fields.</p><p><button class="btn" data-act="go" data-p="map">Open my farm</button></p></div>`;
}

export function dashboard(): string {
  const Ls = byUrgency();
  if (!S.fd) S.fd = Ls[0].id;
  const f = fld(S.fd);
  const n = F.filter((x) => ws(x) === 'now').length;
  const open = openAlerts();
  const healthy = F.filter((x) => x.hl === 'ok').length;
  const avg = Math.round(sum((x) => x.m) / F.length);
  return `${demo}<p class=kick>Good morning, ${esc(firstName())} · ${esc(S.farm)}</p><h1 class=mast>${n ? `Water ${n} field${n > 1 ? 's' : ''} today.` : 'Nothing to water today.'}</h1>${feat(f)}<h2 class=sh>All fields at a glance</h2><div class=tiles>${Ls.map(tile).join('')}</div><h2 class=sh>The week ahead</h2><div class='blk cream'><div class=wk>${W.map(
    (d) => `<div class=wc><b>${d.rain}%</b><div class=wb><i style='height:${Math.max(4, d.rain)}%'></i></div><b>${d.day}</b><span>${T(d.temp)}</span></div>`,
  ).join('')}</div><p>Blue bars show the chance of rain. Tomorrow (6 mm) and Tuesday (14 mm) are the wet days.</p></div><div class='grid g2' style='margin-top:14px'><div class='blk orange' style='margin:0'><h2>Needs you</h2>${alertItems(3)}<button class=btn data-act=go data-p=alerts>All ${open.length} alerts</button></div><div class='blk lime row' style='margin:0;justify-content:flex-start;gap:20px'><div class=ring style='background:conic-gradient(#1b2229 0 ${(healthy / F.length) * 100}%,rgba(6,33,15,.2) 0)'><b>${healthy}/${F.length}</b></div><div><h2>Fields healthy</h2><p>${F.filter((x) => x.hl !== 'ok')
    .map((x) => x.name)
    .join(', ')} need a look.</p></div></div></div><h2 class=sh>Fields &amp; sensors</h2><div class=row style='justify-content:flex-start;gap:24px'><div class=fn style='font-size:clamp(4rem,10vw,7rem);color:var(--g)'>${sum((x) => x.s[0])}<span>/${sum((x) => x.s[1])}</span></div><div><p>${sum((x) => x.s[0])} of ${sum((x) => x.s[1])} sensors reporting · average soil moisture ${avg}%.</p><button class='btn alt' data-act=go data-p=field>Open fields &amp; sensors</button></div></div>`;
}

const history = (f: Field) => {
  const k = S.mk;
  const met = metric(k);
  const station = isStation(k);
  const rows = SEN.filter((x) => x.f === f.id)
    .map((x, j) => {
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
    .join('');
  return `<div class=card><h3>${met.name}, last 7 days</h3><p class=mut>Green band is the ideal range for ${f.crop.toLowerCase()}. Blue bars are rain. Red dots are odd readings we ignored. Gaps mean no data.</p>${chart(f, k)}</div><div class=card style='margin-top:14px'><h3>Sensors in ${f.name}</h3><table><tr><th>Sensor</th><th>Status</th><th>${station ? 'Field now' : met.name}</th></tr>${rows}</table></div>`;
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
  const f = fld(S.sel);
  const r = REC.find((x) => x.f === f.id);
  const tiles = MET.map((m) => {
    const rg = idealRange(f, m);
    const v = f[m.key];
    const o = v < rg[0] ? 'low' : v > rg[1] ? 'high' : 'in range';
    const temp = m.unit === '°C';
    return `<div class='mt ${o === 'in range' ? '' : 'off'}'><div class=mv>${temp ? T(v) : v}<small>${temp ? '' : m.unit}</small></div><b>${m.name}</b>${rng(v, rg)}<span>${o}</span></div>`;
  }).join('');
  const rec = r ? `<div class='blk orange'><h2>Recommended action</h2><p><b>${r.t}</b></p><p>${r.w}</p><p>${r.c}</p></div>` : `<div class='blk lime'><h2>Recommended action</h2><p>No action needed for this field right now.</p></div>`;
  const metricTabs = MET.map((m) => `<button aria-pressed=${m.key === S.mk} data-act=mk data-k=${m.key}>${m.name}</button>`).join('');
  return `${demo}<h1>Fields &amp; sensors</h1><p class=mut>Readings, history and watering for each parcel — in one place.</p>${fieldTabs()}${feat(f)}<h2 class=sh>Readings against the ideal</h2><div class=mgrid>${tiles}</div>${rec}<h2 class=sh>Sensor history</h2><div class=tabs>${metricTabs}</div>${history(f)}${waterLog(f)}`;
}

export function weather(): string {
  const recorded = `<div class='grid g2' style='margin:14px 0'><div class='blk cream' style='margin:0'><h3>Recorded, last 7 days</h3><p>Rain: ${RT} mm last ${DN(64)}<br>Coldest night: ${MN}°C at ${HR(MI)} ${DN(MI)}<br>Hours below freezing: ${FH}</p></div><div class='blk lime' style='margin:0'><h3>Frost watch</h3><p>No frost in the forecast. Lowest expected night is about 6°C.<br>Rain expected: 20 mm over the next 3 days.</p></div></div>`;
  const days = W.map(
    (d) =>
      `<div class="day"><b>${d.day}</b><div class="big" style="font-size:1.3rem">${T(d.temp)}</div><div>${d.sky}</div><div class="mut">${d.rain}% rain · ${d.mm} mm</div><div class="mut">Wind ${d.wind + 8} km/h</div></div>`,
  ).join('');
  return `${demo}<h1>Weather and your fields</h1>${recorded}<div class="card"><div class="big">${T(16)}</div><p class="mut">Sunny · Wind 12 km/h · Humidity 58% · Rain chance 10%</p></div>
<h2 style="margin:18px 0 8px">Next 7 days</h2><div class="days">${days}</div>
<div class="card" style="margin-top:14px"><h3>What this means for your fields</h3><div class="item"><div>${pill('wn')}</div><div>Rain tomorrow: consider postponing irrigation in East Canola.</div></div><div class="item"><div>${pill('cr')}</div><div>North Wheat is too dry to wait for Tuesday’s rain. Water lightly today.</div></div><div class="item"><div>${pill('ok')}</div><div>Thursday to Saturday look dry. Plan field checks then.</div></div><p class="mut">Forecasts are estimates, not promises.</p></div>`;
}

export function recs(): string {
  const cards = REC.map((r) => {
    const done = !!S.done[r.id];
    const actions = done
      ? '<span class="pill ok">✓ Marked done</span>'
      : `<button class="btn" data-act="done" data-rid="${r.id}">Mark as done</button> <button class="btn alt" data-act="say" data-t="We’ll remind you in 4 hours">Remind me later</button>`;
    return `<div class="card" style="margin-bottom:12px"><div class="row"><div style="display:flex;gap:8px;align-items:center">${can(ws(fld(r.f)), 34)}${pill(r.p === 'in' ? 'ok' : r.p)}</div><button class="btn alt" data-act="go" data-p="field" data-id="${r.f}">${fld(r.f).name}</button></div><h2 style="margin:8px 0">${done ? '<s>' + r.t + '</s>' : r.t}</h2><p>${r.w}</p><p class="mut">${r.c}</p>${actions}</div>`;
  }).join('');
  return `${demo}<h1>Recommended actions</h1><p class="mut">Ordered by how soon each one matters.</p>${cards}`;
}

const LEVEL_NAME: Record<Level, string> = { cr: 'Critical', wn: 'Warning', in: 'Info', ok: 'OK' };
const FILTERS: [AlertFilter, string][] = [['all', 'All'], ['cr', 'Critical'], ['wn', 'Warning'], ['in', 'Info']];

export function alerts(): string {
  const L = AL.filter((a) => !S.dis[a.id] && (S.flt === 'all' || a.l === S.flt));
  const tabs = FILTERS.map(([k, n]) => `<button aria-pressed="${S.flt === k}" data-act="flt" data-k="${k}">${n}</button>`).join('');
  const items = L.length
    ? L.map(
        (a) =>
          `<div class="item"><span class="pill ${a.l}">${LEVEL_NAME[a.l]}</span><div style="flex:1"><b>${a.t}</b><div>${a.d}</div><div class="mut">${a.ago}</div></div>${a.f ? `<button class="btn alt" data-act="go" data-p="field" data-id="${a.f}">View</button>` : ''}<button class="btn alt" data-act="dis" data-aid="${a.id}">Dismiss</button></div>`,
      ).join('')
    : '<p>No alerts here. Nothing needs your attention.</p>';
  return `${demo}<h1>Alerts</h1><div class="tabs">${tabs}</div><div class="card">${items}</div>`;
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
      `<tr><td>${f.name}</td><td>${f.s[0]} of ${f.s[1]}</td><td><button class="btn alt" data-act="say" data-t="Pairing is not available in this demo">Add sensor</button></td></tr>`,
  ).join('');
  return `${demo}<h1>Settings</h1><div class="stack"><div class="card"><h3>Farm</h3><label for="fn2">Farm name</label><input id="fn2" data-bind="farm" value="${esc(S.farm)}"><label for="un">Temperature units</label><select id="un" data-bind="units"><option ${S.units === '°C' ? 'selected' : ''}>°C</option><option ${S.units === '°F' ? 'selected' : ''}>°F</option></select><p><button class="btn" data-act="say" data-t="Settings saved">Save changes</button></p></div>
<div class="card"><h3>Notifications</h3>${notify}</div>
<div class="card"><h3>Sensors</h3><table><tr><th>Field</th><th>Online</th><th></th></tr>${sensors}</table></div><p><button class="btn alt" data-act="go" data-p="login">Edit farm setup</button></p></div>`;
}

export function profile(): string {
  const roles = ['Owner', 'Farm manager', 'Field worker'].map((r) => `<option ${r === S.role ? 'selected' : ''}>${r}</option>`).join('');
  const fields = F.map(
    (x) => `<button class=lb data-act=pkm data-id=${x.id}><span>${x.name} <span class=mut>· ${x.crop}</span></span>${pill(x.hl)}</button>`,
  ).join('');
  return `${demo}<h1>Your profile</h1><div class='grid g2'><div class=card><div class=row style='justify-content:flex-start;gap:16px'><div class=av>${esc(initials())}</div><div><h2>${esc(S.name)}</h2><span class=mut>${esc(S.role)} · ${esc(S.farm)}</span></div></div><label for=pn>Your name</label><input id=pn data-bind=name value="${esc(S.name)}"><label for=pf>Farm name</label><input id=pf data-bind=farm value="${esc(S.farm)}"><label for=pr>Your role</label><select id=pr data-bind=role>${roles}</select><label for=pl>Language</label><select id=pl><option>English</option><option>Español</option><option>Français</option></select><p><button class=btn data-act=say data-t='Profile saved'>Save changes</button></p></div><div class=card><h3>My fields</h3><p class=mut>Tap a field to see it on the map.</p>${fields}<p style='margin-top:14px'><button class='btn alt' data-act=go data-p=settings>Notifications and sensors</button> <button class='btn alt' data-act=go data-p=login>Edit farm setup</button></p></div></div>`;
}

export function wateringModal(f: Field): string {
  const k = ws(f);
  const w = WS[k];
  const [lo, hi] = f.mi;
  const why: Record<WaterState, string> = {
    now: `Soil is at ${f.m}%, below the ${lo}–${hi}% ${f.crop.toLowerCase()} needs. The next real rain is about 2 days away, which is too late.`,
    soon: `Moisture is fine at ${f.m}%, but the soil is warm (${T(f.st)}) and will dry out fast.`,
    rain: `Moisture is ${f.m}%, just under range, but about 6 mm of rain is likely tomorrow (70% chance).`,
    none: `Moisture is ${f.m}%, inside the ${lo}–${hi}% range. More rain is coming later this week too.`,
  };
  const next: Record<WaterState, string> = {
    now: 'Water lightly today (about 10 mm), then check again tonight.',
    soon: 'Check this field this afternoon. Water this evening if moisture keeps dropping.',
    rain: 'Hold off. If less than 3 mm falls by tomorrow evening, water then.',
    none: 'Nothing to do. Check again on Thursday.',
  };
  return `<div class=mdl data-act=cm><div class=sheet role=dialog aria-modal=true aria-label='Watering details' style='border-top-color:${w.h}'><div class=row><div style='display:flex;gap:12px;align-items:center'>${can(k, 60)}<div><h2>${f.name}</h2><b style='color:${w.c};font-size:1.15rem'>${w.t}</b></div></div><button class='btn alt' data-act=cm>Close</button></div><div class=item style='display:block'><div class=row><span>Soil moisture now</span><b>${f.m}%</b></div>${rng(f.m, f.mi)}<div class=mut>Recommended for ${f.crop.toLowerCase()}: ${lo}–${hi}%</div></div><p><b>Weather:</b> ${T(16)}, sunny today (10% rain). Tomorrow: 70% chance, about 6 mm.</p><p><b>Why:</b> ${why[k]}</p><div class=nx><span class=mut>Next step</span><br>${next[k]}</div><p style='margin-top:14px'><button class=btn data-act=gf data-id=${f.id}>Open field details</button></p></div></div>`;
}
