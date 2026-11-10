// The field models on the field page (R-009, R-021 to R-025): what to do and when, the field's watering
// setup with the suggested trigger, sensor health, and the detected watering and rain the farmer can correct.
// Every learned number is shown with its evidence, and nothing learned is used until the farmer saves it.
import { TEXTURE_NAMES, textureOf } from '../../lib/ml/agronomy';
import { S } from '../state';
import type { EventLabel, Field, LiveAdvice, SensorHealthRow, WettingEventRow } from '../types';
import { esc } from '../ui/helpers';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const advice = (f: Field): LiveAdvice | undefined => S.liveAdvice[f.id];

/** The status chip: the server's advice when there is some, never the seed's guess (e.g. "Not configured"). */
/** The farmer's saved trigger for an irrigated field, or null. */
export const triggerOf = (f: Field): number | null => {
  const a = S.liveAdvice[f.id];
  return a?.setup.irrigated ? (a.setup.trigger?.value ?? null) : null;
};

/** "Last watered" from the detected events (R-023), not a log kept in the browser. */
export const lastWateredText = (a: LiveAdvice) => (a.lastWatered ? day(a.lastWatered) : 'None in the last 14 days');

/** The trigger the farmer saved, in a few words for small spaces. */
export function triggerShort(a: LiveAdvice): string {
  if (!a.setup.irrigated) return 'Rain-fed';
  return a.setup.trigger ? `Your trigger ${a.setup.trigger.value}%` : 'No trigger set';
}

export function healthOf(a: LiveAdvice | undefined, sensorId: string): SensorHealthRow | undefined {
  return a?.sensorHealth.find((h) => h.sensorId === sensorId && h.status !== 'ok');
}

/** The status cell for a sensor the models flagged (R-022), or null to keep the usual online/offline status. */
export function healthPill(h: SensorHealthRow | undefined): string | null {
  if (!h) return null;
  const tone = h.status === 'faulty' ? 'cr' : 'wn';
  const lead = h.status === 'faulty' ? 'Check sensor (left out of advice)' : 'Check sensor';
  return `<span class='pill ${tone}' data-testid=sensor-status title='${esc(h.reason ?? '')}'>▲ ${lead}: ${esc(h.reason ?? '')}</span>`;
}

// ---- what to do, and by when --------------------------------------------------------------

export function wateringBlock(f: Field, a: LiveAdvice): string {
  const tone = a.status === 'water_today' ? 'orange' : a.status === 'check_sensors' || a.status === 'no_recent_reading' ? 'cream' : 'lime';
  const warnings = [a.soilWarning, a.frostWarning].filter((x): x is string => !!x).map((w) => `<p class=wwarn>${esc(w)}</p>`).join('');
  const last = `<p class='mut tiny'>Last watered: <b data-testid=last-watered>${lastWateredText(a)}</b></p>`;
  if (a.status === 'rain_fed') {
    const moisture = a.driestValue != null ? `Driest probe reads ${a.driestValue}% soil moisture.` : 'No recent soil moisture reading.';
    const dry = a.rainNext48hMm < 1 ? `<p class=wnote data-testid=dry-forecast-note>Dry spell: no rain is forecast in the next 48 hours.</p>` : '';
    return `<div class='blk ${tone}' data-testid=watering-block><h2>Watering</h2><p data-testid=watering-recommendation><b>Rain-fed</b> · no watering advice for this field</p><p data-testid=soil-moisture-status>${moisture}</p>${dry}${warnings}${last}<p class='mut tiny'>Can you water this field? Turn on <b>Irrigated</b> in the setup below.</p></div>`;
  }
  const by = a.waterBy ? `<p class=waterby data-testid=water-by>${esc(a.waterBy.text)}</p>` : '';
  return `<div class='blk ${tone}' data-testid=watering-block><h2>Watering</h2><p class=wlabel data-testid=watering-recommendation><b>${esc(a.label)}</b></p><p data-testid=watering-reason>${esc(a.reason)}</p>${by}${warnings}${last}</div>`;
}

// ---- the field's watering setup (R-009, R-021, R-024) -------------------------------------

function soilPicker(f: Field, soil: string): string {
  const texture = soil ? textureOf(soil)?.name : undefined;
  const exact = texture && texture === soil.trim().toLowerCase();
  // The farmer's own words stay selected; we say which table row they read as, or that none fits.
  const custom =
    soil && !exact
      ? `<option value="${esc(soil)}" selected>${esc(soil)}${texture ? ` (read as ${texture})` : ' (not in the FAO-56 soil table)'}</option>`
      : '';
  const none = !soil ? `<option value="" selected>Choose a soil type</option>` : '';
  const opts = TEXTURE_NAMES.map((t) => `<option value="${t}" ${exact && t === texture ? 'selected' : ''}>${cap(t)}</option>`).join('');
  const hint = soil && !texture ? `<p class='mut tiny'>Pick the closest soil type above to get a suggested trigger.</p>` : '';
  return `<label for=soil-${f.id}>Soil type</label><select id=soil-${f.id} data-fsoil=${f.id} data-testid=soil-select>${none}${custom}${opts}</select>${hint}`;
}

export function setupCard(f: Field, a: LiveAdvice): string {
  const { irrigated, trigger, soil } = a.setup;
  const toggle = `<div class=row><div><b>Irrigated field</b><div class='mut tiny'>${irrigated ? 'You can water this field, so Fieldwise tells you when.' : 'Rain-fed: Fieldwise shows soil moisture and dry spells, never "Water today".'}</div></div><button class='tgl' role=switch aria-checked=${irrigated} data-act=irr data-id=${f.id} data-testid=irrigated-toggle><span>${irrigated ? 'Yes' : 'No'}</span></button></div>`;
  if (!irrigated) return `<div class='card setup' data-testid=irrigation-setup><h3>Watering setup</h3>${toggle}${soilPicker(f, soil)}</div>`;

  const saved = trigger
    ? `<div class=trig><div>Your trigger <b class=tv>${trigger.value}%</b><div class='mut tiny'>${trigger.source === 'suggested' ? 'Suggested by Fieldwise' : 'Set by you'} · ${esc(trigger.basis)}</div></div><button class='btn alt sm' data-act=clrtrig data-id=${f.id} data-testid=clear-trigger>Clear</button></div>`
    : `<p class=wnote>No trigger saved yet, so there is no "Water today" for this field. Use the suggestion or set your own.</p>`;

  const s = a.triggerSuggestion;
  const suggestion =
    s && s.value !== trigger?.value
      ? `<div class=sugg data-testid=trigger-suggestion><div>Suggested trigger <b class=tv>${s.value}%</b></div><p class='mut tiny'>${esc(cap(s.basis))}.</p><button class='btn sm' data-act=usesug data-id=${f.id} data-testid=save-suggested-trigger>Use ${s.value}%</button></div>`
      : '';
  const learning =
    !s && a.learning.length
      ? `<p class=learn data-testid=trigger-learning>Learning your field: needs ${a.learning.map(esc).join(', and ')}.</p>`
      : '';
  const own = `<div class=own><label for=trig-${f.id}>${trigger ? 'Change the trigger' : 'Set your own trigger'} (soil moisture %)</label><div class=row><input id=trig-${f.id} type=number min=1 max=80 step=1 inputmode=numeric placeholder="e.g. 28" data-testid=trigger-input><button class='btn alt sm' data-act=savetrig data-id=${f.id} data-testid=save-trigger>Save</button></div></div>`;
  return `<div class='card setup' data-testid=irrigation-setup><h3>Watering setup</h3>${toggle}${soilPicker(f, soil)}${saved}${suggestion}${learning}${own}</div>`;
}

// ---- detected watering and rain (R-023) ---------------------------------------------------

const LABEL: Record<EventLabel, string> = { irrigation: 'Irrigation', rain: 'Rain', none: 'Not a soaking' };
const ICON: Record<EventLabel, string> = { irrigation: '💧', rain: '🌧', none: '·' };

function eventRow(f: Field, e: WettingEventRow): string {
  const source = e.source === 'farmer' ? 'your label' : e.confidence === 'low' ? 'detected, not sure' : 'detected';
  const rain = e.rainMm > 0 ? ` · ${e.rainMm} mm rain recorded` : ' · no rain recorded';
  const rises = e.rises
    .map((r) => `<span class='rise${r.low ? ' low' : ''}' data-testid=sensor-rise title='${r.low ? 'Rose much less than the others: water may not be reaching it' : ''}'>${esc(r.sensorName)} +${r.rise}${r.low ? ' (low)' : ''}</span>`)
    .join('');
  const btn = (l: EventLabel, text: string) =>
    `<button class='chip-btn' aria-pressed=${e.label === l} data-act=evl data-id=${f.id} data-start='${e.start}' data-l=${l} data-testid=event-mark-${l}>${text}</button>`;
  const undo = e.source === 'farmer' ? `<button class='chip-btn' data-act=evl data-id=${f.id} data-start='${e.start}' data-l='' data-testid=event-undo>Undo</button>` : '';
  const ask = e.source === 'detected' && e.label === 'irrigation' ? 'Did you water?' : 'Not right?';
  return `<div class=evt data-testid=wetting-event><div class=evh><span class=evi aria-hidden=true>${ICON[e.label]}</span><div><b>${LABEL[e.label]}</b> · ${when(e.start)}<div class='mut tiny'>${source}${rain}</div></div></div><div class=rises>${rises}</div><div class=evb><span class='mut tiny'>${ask}</span>${btn('irrigation', 'Watered')}${btn('rain', 'Rain')}${btn('none', 'Neither')}${undo}</div></div>`;
}

export function eventsCard(f: Field, a: LiveAdvice): string {
  const rows = a.events.map((e) => eventRow(f, e)).join('');
  return `<div class='card events' data-testid=wetting-events><h3>Watering and rain, last 14 days</h3><p class='mut tiny'>Found from your probes and the farm's rain record. Correct any that are wrong: your labels are kept and used.</p>${rows || `<p class=mut>No soakings found in the last 14 days.</p>`}</div>`;
}
