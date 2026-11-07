import { HL, MET } from '../seed/farm';
import { AL } from '../seed/simulate';
import { S } from '../state';
import type { Field, FieldId, Level, Metric, MetricKey, Range, StationKey, WaterState } from '../types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export const pill = (k: Level) => `<span class="pill ${k}">${HL[k][1]} ${HL[k][0]}</span>`;

export const T = (c: number) => (S.units === '°F' ? Math.round((c * 9) / 5 + 32) + '°F' : c + '°C');

export const demo =
  '<div class="demo">Demo data: every reading, forecast and alert here is simulated. No real sensors or weather service are connected.</div>';

export function rng(v: number, r: Range): string {
  const span = r[1] * 1.4 - r[0] * 0.5;
  const p = Math.max(0, Math.min(100, ((v - r[0] * 0.5) / span) * 100));
  const a = ((r[0] - r[0] * 0.5) / span) * 100;
  const b = ((r[1] - r[0] * 0.5) / span) * 100;
  return `<div class="bar"><i style="left:${a}%;width:${b - a}%"></i><b style="left:${p}%"></b></div>`;
}

export const mix = (a: number[], b: number[], t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k))})`;
};

export const ws = (f: Field): WaterState => {
  const lo = f.mi[0];
  if (f.m < lo) return f.m >= lo - 3 ? 'rain' : 'now';
  return f.stMax > 20 || f.m < lo + 4 ? 'soon' : 'none';
};

export const metric = (k: MetricKey): Metric => MET.find((m) => m.key === k) ?? MET[0];
export const idealRange = (f: Field, m: Metric): Range => (m.key === 'ph' && f.phr) || m.range || f.mi;
export const isStation = (k: MetricKey): k is StationKey => k === 'at' || k === 'h' || k === 'l';
export const fieldNo = (id: FieldId) => '0' + ('ABCDEF'.indexOf(id) + 1);

export const openAlerts = () => AL.filter((a) => !S.dis[a.id] && a.l !== 'in');
export const firstName = () => S.name.split(' ')[0] ?? '';
export const initials = () =>
  S.name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
