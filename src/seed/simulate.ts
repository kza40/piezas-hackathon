// Simulated week of sensor and weather-station readings (168 hourly samples,
// index 167 = the current hour). Deterministic per sensor id so every load
// shows the same farm.
import type { Alert, Field, FieldId, Recommendation, Sensor, SensorKey, StationKey } from '../types';
import { FIELD_SEEDS } from './farm';

const HOURS = 168;
const NOW = new Date();

export const HOD = (h: number) => (((NOW.getHours() - (167 - h)) % 24) + 24) % 24;
export const DN = (h: number) =>
  new Date(NOW.getTime() - (167 - h) * 36e5).toLocaleDateString('en', { weekday: 'short' });
export const HR = (h: number) => {
  const x = HOD(h);
  return (x % 12 || 12) + ':00 ' + (x < 12 ? 'am' : 'pm');
};

const hash = (q: string) => {
  let h = 2166136261;
  for (const c of q) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const prng = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const RAIN: number[] = Array(HOURS).fill(0);
[2, 4, 3, 2, 1].forEach((v, i) => {
  RAIN[62 + i] = v;
});

let coldestHour = 100;
for (let t = 60; t <= 140; t++) {
  if (HOD(t) === 4 && 167 - t >= 36 && 167 - t <= 72) {
    coldestHour = t;
    break;
  }
}
const COLD = (t: number) => -5.2 * Math.exp(-((t - coldestHour) ** 2) / 72);
const DAY_SHIFT = [0, -0.5, 1, 2.5, 1.5, 0.5, -1, 0.5];
const DY = (t: number) => Math.floor((167 - t) / 24);

const FIELD_PHYSICS: Record<FieldId, { d: number; s: number; p: number; e: number }> = {
  A: { d: 0.11, s: 11.5, p: 6.3, e: 0.5 },
  B: { d: 0.08, s: 12.5, p: 6.7, e: 0.6 },
  C: { d: 0.06, s: 12, p: 6.8, e: 0.5 },
  D: { d: 0.07, s: 11.8, p: 6.5, e: 0.6 },
  E: { d: 0.05, s: 14, p: 7.0, e: 1.25 },
  F: { d: 0.09, s: 20, p: 5.1, e: 0.7 },
};

interface SensorQuirks {
  gap?: [from: number, to: number];
  gl?: Partial<Record<SensorKey, [hour: number, value: number]>>;
  age?: number;
}

const SENSOR_SPECS: [id: string, moisture: number, quirks?: SensorQuirks][] = [
  ['A-1', 17.2], ['A-2', 19.4, { gap: [118, 122] }], ['A-3', 20.1, { gl: { m: [70, 99] } }], ['A-4', 19],
  ['B-1', 17], ['B-2', 34.2, { gl: { st: [130, 85] } }], ['B-3', 36.6],
  ['C-1', 37, { gap: [40, 42] }], ['C-2', 38.5], ['C-3', 35.8, { gl: { ec: [150, 9.9] } }], ['C-4', 36.9],
  ['D-1', 37.2], ['D-2', 38.1], ['D-3', 36.4, { age: 72 }],
  ['E-1', 42.3, { gl: { ph: [20, 14] } }], ['E-2', 45.1, { gap: [90, 91] }], ['E-3', 43.4],
  ['F-1', 34.5], ['F-2', 36.2], ['F-3', 35.1, { age: 8 }],
];

const SENSOR_KEYS: SensorKey[] = ['m', 'st', 'ph', 'ec'];

export const SEN: Sensor[] = SENSOR_SPECS.map(([id, target, o = {}]) => {
  const f = id[0] as FieldId;
  const P = FIELD_PHYSICS[f];
  const r = prng(hash(id));
  const age = o.age ?? 0;
  const last = 167 - age;
  const v: Record<SensorKey, (number | null)[]> = { m: [], st: [], ph: [], ec: [] };
  const gl: Record<SensorKey, Set<number>> = { m: new Set(), st: new Set(), ph: new Set(), ec: new Set() };
  const so = (r() - 0.5) * 0.8;
  const po = (r() - 0.5) * 0.06;
  const eo = (r() - 0.5) * 0.06;
  const amp = f === 'F' ? 2.5 : 1.6;
  const raw: number[] = [];
  let q = 0;
  for (let t = 0; t < HOURS; t++) {
    if (t) {
      const dayRate = HOD(t) >= 9 && HOD(t) <= 18 ? 1.5 : 0.6;
      q += -P.d * dayRate * (1 + (r() - 0.5) * 0.3) + RAIN[t] * 0.9 * (0.9 + r() * 0.2);
    }
    raw.push(q);
  }
  for (let t = 0; t < HOURS; t++) {
    const rn = t >= 62 ? Math.min(1, (t - 62) / 6) : 0;
    const dc = Math.exp(-Math.max(0, t - 66) / 90);
    v.m.push(+(raw[t] - raw[last] + target + (t === last ? 0 : (r() - 0.5) * 0.5)).toFixed(1));
    v.st.push(
      +(P.s + so + amp * Math.sin((2 * Math.PI * (HOD(t) - 14)) / 24) + 0.45 * COLD(t) + DAY_SHIFT[DY(t)] * 0.2 + (r() - 0.5) * 0.2).toFixed(1),
    );
    v.ph.push(+(P.p + po + 0.05 * Math.sin(t / 55) - 0.07 * rn * dc + (r() - 0.5) * 0.03).toFixed(2));
    v.ec.push(+(P.e + eo + 0.03 * Math.sin(t / 70) - 0.08 * rn * dc + (r() - 0.5) * 0.02).toFixed(2));
  }
  if (o.gap) for (let t = o.gap[0]; t <= o.gap[1]; t++) SENSOR_KEYS.forEach((k) => (v[k][t] = null));
  if (o.gl) {
    for (const [k, odd] of Object.entries(o.gl) as [SensorKey, [number, number]][]) {
      v[k][odd[0]] = odd[1];
      gl[k].add(odd[0]);
    }
  }
  if (age) for (let t = last + 1; t < HOURS; t++) SENSOR_KEYS.forEach((k) => (v[k][t] = null));
  return { id, f, age, vals: v, gl };
});

export const lastV = (s: Sensor, k: SensorKey): number | null => {
  for (let t = 167; t >= 0; t--) {
    const x = s.vals[k][t];
    if (x != null && !s.gl[k].has(t)) return x;
  }
  return null;
};

const lastOr0 = (s: Sensor, k: SensorKey) => lastV(s, k) ?? 0;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

export const F: Field[] = FIELD_SEEDS.map((seed) => {
  const r = prng(hash('st' + seed.id));
  const ao = (r() - 0.5) * 0.8;
  const fs = SEN.filter((x) => x.f === seed.id);
  const fresh = fs.filter((x) => x.age <= 6);
  const stn: Record<StationKey, number[]> = { at: [], h: [], l: [] };
  for (let t = 0; t < HOURS; t++) {
    const a = 9 + ao + 7.5 * Math.sin((2 * Math.PI * (HOD(t) - 9)) / 24) + DAY_SHIFT[DY(t)] + COLD(t) + (r() - 0.5) * 0.6;
    const hd = HOD(t);
    const daylight = hd >= 7 && hd <= 17 ? Math.sin((Math.PI * (hd - 7)) / 10) : 0;
    const cloud = Math.abs(t - 64) < 12 ? 0.45 : [1, 0.9, 0.8, 0.6, 1, 0.95, 0.85, 0.9][DY(t)];
    stn.at.push(+a.toFixed(1));
    stn.h.push(Math.round(Math.max(25, Math.min(98, 68 - 1.7 * (a - 9) + (Math.abs(t - 64) < 8 ? 14 : 0) + (r() - 0.5) * 4))));
    stn.l.push(Math.round(100 * daylight * cloud));
  }
  const m = Math.round(mean(fresh.map((x) => lastOr0(x, 'm'))));
  const ph = +mean(fresh.map((x) => lastOr0(x, 'ph'))).toFixed(1);
  const ec = +mean(fresh.map((x) => lastOr0(x, 'ec'))).toFixed(2);
  const st = +mean(fresh.map((x) => lastOr0(x, 'st'))).toFixed(1);
  const stMax = Math.max(
    ...fresh.flatMap((x) => x.vals.st.slice(144).filter((y, i): y is number => y != null && !x.gl.st.has(144 + i))),
  );
  const lo = seed.mi[0];
  const [phLo, phHi] = seed.phr ?? [6, 7.2];
  const dry = fs.some((x) => lastOr0(x, 'm') < 20);
  const needsLook = m < lo || stMax > 20 || fs.some((x) => x.age > 6) || dry || ec > 1 || ph < phLo || ph > phHi;
  return {
    ...seed,
    m,
    st,
    stMax,
    at: stn.at[167],
    h: stn.h[167],
    ph,
    ec,
    l: Math.max(...stn.l.slice(144)),
    s: [fresh.length, fs.length],
    hl: m < lo - 5 ? 'cr' : needsLook ? 'wn' : 'ok',
    stn,
  };
});

export const fld = (id: string | null | undefined): Field => F.find((f) => f.id === id) ?? F[0];
const sensor = (id: string) => SEN.find((x) => x.id === id)!;

const airA = F[0].stn.at;
export const MN = Math.min(...airA);
export const MI = airA.indexOf(MN);
export const FH = airA.filter((x) => x < 0).length;
export const RT = RAIN.reduce((a, b) => a + b, 0);
const RJ = Math.round(SEN.reduce((a, x) => a + (x.vals.m[68] ?? 0) - (x.vals.m[58] ?? 0), 0) / SEN.length);
const GL = SEN.reduce((a, x) => a + Object.values(x.gl).reduce((b, z) => b + z.size, 0), 0);
const GP = SEN.reduce((a, x) => a + x.vals.m.filter((y, i) => y == null && 167 - i > x.age).length, 0);

const A = fld('A');
const B1 = lastV(sensor('B-1'), 'm');

export const AL: Alert[] = [
  { id: 1, l: 'cr', t: 'Low soil moisture', f: 'A', d: `North Wheat averages ${A.m}%, well below its ${A.mi[0]}% minimum.`, ago: '20 min ago' },
  {
    id: 2,
    l: 'wn',
    t: 'Possible dry patch',
    f: 'B',
    d: `Sensor B-1 reads ${B1}% while B-2 and B-3 read ${Math.round(lastOr0(sensor('B-2'), 'm'))}–${Math.round(lastOr0(sensor('B-3'), 'm'))}%. Check for a blocked line or a bad sensor.`,
    ago: '1 hr ago',
  },
  { id: 3, l: 'wn', t: 'Salinity above limit', f: 'E', d: `Creek Alfalfa salinity (EC) is ${fld('E').ec} mS/cm, above the 1.0 limit.`, ago: '2 hr ago' },
  { id: 4, l: 'wn', t: 'Sensor not reporting', f: 'F', d: 'F-3 last reported 8 hours ago.', ago: '3 hr ago' },
  { id: 5, l: 'wn', t: 'Sensor silent for 3 days', f: 'D', d: 'D-3 has sent nothing for 3 days. Check its battery and connection.', ago: '3 days ago' },
  { id: 6, l: 'wn', t: 'Frost recorded', f: '', d: `Air fell to ${MN}°C on ${DN(MI)} at ${HR(MI)}. Check frost-sensitive crops.`, ago: '2 nights ago' },
  { id: 7, l: 'wn', t: 'Heavy rain expected', f: '', d: '14 mm likely Tuesday. Check drainage in Creek Alfalfa.', ago: '1 hr ago' },
  { id: 8, l: 'in', t: 'Rain recorded', f: '', d: `About ${RT} mm fell last ${DN(64)}. Soil moisture rose roughly ${RJ} points in every field.`, ago: DN(64) },
  { id: 9, l: 'in', t: 'Data quality', f: '', d: `${GL} odd readings were ignored and ${GP} missing sensor-hours were left as gaps.`, ago: 'today' },
];

export const REC: Recommendation[] = [
  {
    id: 1,
    f: 'A',
    p: 'cr',
    t: 'Water North Wheat today',
    w: `Soil moisture is ${A.m}%, below the 30–45% range wheat likes. Rain is about 2 days away and may come too late, so water lightly now (about 10 mm).`,
    c: 'Forecasts can change; check again this evening.',
  },
  {
    id: 2,
    f: 'B',
    p: 'wn',
    t: 'Hold off watering East Canola, but check sensor B-1',
    w: `Average moisture is ${fld('B').m}%, just under range, and about 6 mm of rain is likely tomorrow. Sensor B-1 reads only ${B1}% while its neighbours read 34–37%, which points to a dry patch or a sensor fault.`,
    c: 'Walk the field near B-1 before you decide.',
  },
  {
    id: 3,
    f: 'E',
    p: 'wn',
    t: 'Watch salinity in Creek Alfalfa',
    w: `Salinity (EC) is ${fld('E').ec} mS/cm, above the 1.0 limit. Moisture and pH are fine.`,
    c: 'Tuesday’s rain may help flush salts. Re-check afterwards.',
  },
  {
    id: 4,
    f: 'F',
    p: 'wn',
    t: 'Check sensor F-3 and soil heat in Blueberry Hill',
    w: `F-3 last reported 8 hours ago, and soil peaks near ${fld('F').stMax}°C in the afternoon. Blueberry roots are shallow, so the top few inches matter most. Soil pH is ${fld('F').ph}, inside the 4.5–5.5 blueberries need.`,
    c: 'Warm soil dries out the root zone fast. Plan a short drip cycle this evening and keep the mulch topped up.',
  },
  {
    id: 5,
    f: 'D',
    p: 'wn',
    t: 'Check sensor D-3 in West Oats',
    w: 'D-3 has sent nothing for 3 days. The other two sensors look normal and soil pH is about 6.5.',
    c: 'Check its battery and signal.',
  },
  {
    id: 6,
    f: 'C',
    p: 'in',
    t: 'No action needed for South Barley',
    w: 'Every sensor is in range, and moisture is comfortable. Rain is coming, so skip irrigation this week.',
    c: '',
  },
];
