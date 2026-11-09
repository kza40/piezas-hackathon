import { badRequest } from '../errors';
import { getFarm, getField, type Field } from './farms';
import { listSensors, type Sensor } from './sensors';
import { sensorHistory, RETENTION_DAYS } from './history';
import { hasOpenAlert, openAlert } from './alerts';
import { wateringAdvice } from '../../domain/watering';
import { soilWarning } from '../../domain/soil';
import { frostWarning } from '../../domain/frost';
import { rankPlantingWeeks } from '../../domain/planting';
import type { CropAdviceProfile, MoistureSample, SoilSample, WeatherHour } from '../../domain/types';
import { getWeather } from '../../weather/index';
import type { CropProfile } from './crops';
import type { Reading } from '../readings';
import { sensorHealth, type SensorHealth } from '../../ml/health';
import { detectWettingEvents, lastWatered } from '../../ml/events';
import { estimateFieldCapacity } from '../../ml/capacity';
import { suggestTrigger } from '../../ml/trigger';
import { fitDrying, waterBy, type WaterByResult } from '../../ml/drydown';
import { HOUR, shortDay, type SensorSeries } from '../../ml/types';

function toCrop(c: CropProfile | null): CropAdviceProfile {
  if (!c) throw badRequest('This field needs a crop profile before advice can run.');
  return {
    name: c.name,
    moistureMin: c.moistureMin,
    moistureMax: c.moistureMax,
    phMin: c.phMin,
    phMax: c.phMax,
    ecMax: c.ecMax,
    frostRiskC: c.frostRiskC,
  };
}

function moistureSamples(sensors: Sensor[]): MoistureSample[] {
  const out: MoistureSample[] = [];
  for (const s of sensors) {
    const m = s.latest.soil_moisture;
    if (m) out.push({ sensorId: s.id, sensorName: s.name, value: m.value, time: m.time });
  }
  return out;
}

function soilSample(sensors: Sensor[]): SoilSample {
  let ph: { value: number; time: string } | null = null;
  let ec: { value: number; time: string } | null = null;
  for (const s of sensors) {
    const p = s.latest.soil_ph;
    if (p && (!ph || Date.parse(p.time) > Date.parse(ph.time))) ph = p;
    const e = s.latest.soil_ec;
    if (e && (!ec || Date.parse(e.time) > Date.parse(ec.time))) ec = e;
  }
  return { ph: ph?.value ?? null, ec: ec?.value ?? null };
}

function requireLocation(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) {
    throw badRequest('Add a location (latitude and longitude) to this farm before using weather advice.');
  }
  return { lat, lon };
}

// Farm-local weekday from longitude (15° an hour): close enough for "water by Thu–Fri".
const localDay = (iso: string, lon: number) =>
  new Date(Date.parse(iso) + Math.round(lon / 15) * HOUR).toLocaleDateString('en-CA', { weekday: 'short', timeZone: 'UTC' });

function waterByText(r: WaterByResult, lon: number): string {
  switch (r.kind) {
    case 'now':
      return 'At or below your trigger now.';
    case 'beyond':
      return `Not expected to need water in the next ${r.days} days.`;
    case 'learning':
      return `Learning how fast this soil dries: needs ${r.needs}.`;
    case 'window': {
      const a = localDay(r.window.earliest, lon);
      const b = localDay(r.window.latest, lon);
      const noRain = r.window.ifNoRain ? ` (${localDay(r.window.ifNoRain, lon)} if the forecast rain does not come)` : '';
      return `Water by ${a === b ? a : `${a}–${b}`}${noRain}.`;
    }
  }
}

// The field models (lib/ml) on this field's 14 days of soil moisture and the farm's recent weather.
async function fieldInsight(ownerId: string, field: Field, sensors: Sensor[], recent: WeatherHour[], now: Date) {
  const since = new Date(now.getTime() - RETENTION_DAYS * 24 * HOUR).toISOString();
  const series: SensorSeries[] = await Promise.all(
    sensors.map(async (s) => ({ sensorId: s.id, sensorName: s.name, points: (await sensorHistory(ownerId, s.id, since)).series.soil_moisture ?? [] })),
  );
  const health: SensorHealth[] = sensorHealth(series, recent, now);
  const faulty = new Set(health.filter((h) => h.status === 'faulty').map((h) => h.sensorId));
  const trusted = series.filter((s) => !faulty.has(s.sensorId) && s.points.length);

  const events = detectWettingEvents(trusted, recent, field.eventFeedback);
  // Uneven watering: a sensor that barely rose in the latest soaking may not be getting water.
  const latest = events.filter((e) => e.label !== 'none').at(-1);
  for (const r of latest?.rises.filter((x) => x.low) ?? []) {
    const h = health.find((x) => x.sensorId === r.sensorId);
    if (h && h.status === 'ok') {
      h.status = 'check';
      h.reason = `rose only ${r.rise} points after the ${latest!.label} on ${shortDay(latest!.start)}; water may not be reaching it`;
    }
  }

  const { capacity, needs: capacityNeeds } = estimateFieldCapacity(trusted, events);
  const { suggestion, needs: suggestionNeeds } = suggestTrigger(capacity, field.soil, field.cropProfile?.key ?? '');
  return { series: trusted, faulty, health, events, capacity, suggestion, learning: [capacityNeeds, suggestionNeeds].filter((x): x is string => !!x) };
}

export async function fieldAdvice(
  ownerId: string,
  fieldId: string,
  now = new Date(),
  opts: { openAlerts?: boolean } = {},
) {
  const shouldOpenAlerts = opts.openAlerts !== false;
  const field = await getField(ownerId, fieldId);
  const farm = await getFarm(ownerId, field.farmId);
  const { lat, lon } = requireLocation(farm.latitude, farm.longitude);
  const sensors = await listSensors(ownerId, fieldId, now);
  const wx = getWeather(farm);
  const [weather, recent] = await Promise.all([wx.getForecast(lat, lon, now), wx.getRecent(lat, lon, now)]);
  const crop = toCrop(field.cropProfile);
  const insight = await fieldInsight(ownerId, field, sensors, recent, now);

  const trustedSensors = sensors.filter((s) => !insight.faulty.has(s.id)); // R-022
  const trigger = field.trigger?.value ?? null;
  const watering = wateringAdvice(crop, moistureSamples(trustedSensors), weather, now, {
    irrigated: field.irrigated,
    trigger,
    faultySensors: insight.faulty.size,
  });

  // R-025: only for an irrigated field with a trigger and a fresh driest reading.
  let when: (WaterByResult & { text: string }) | null = null;
  const driest = trustedSensors.find((s) => s.id === watering.driestSensorId);
  if (field.irrigated && trigger != null && driest && watering.driestValue != null && watering.status !== 'no_recent_reading') {
    const points = insight.series.find((s) => s.sensorId === driest.id)?.points ?? [];
    const r = waterBy(watering.driestValue, trigger, fitDrying(points, recent, insight.events), weather.outlook);
    when = { ...r, text: waterByText(r, lon) };
  }

  const soil = soilWarning(crop, soilSample(sensors));
  const frost = frostWarning(crop, weather.overnightLowC);
  const alert =
    shouldOpenAlerts && watering.status === 'water_today'
      ? await openAlert(ownerId, fieldId, watering.reason, now)
      : null;
  return {
    watering,
    waterBy: when,
    soilWarning: soil,
    frostWarning: frost,
    weather: {
      rainNext48hMm: weather.rainNext48hMm,
      overnightLowC: weather.overnightLowC,
      hours: weather.hours,
    },
    alert,
    setup: { irrigated: field.irrigated, trigger: field.trigger, soil: field.soil },
    sensorHealth: insight.health,
    events: [...insight.events].reverse(), // newest first
    lastWatered: lastWatered(insight.events),
    fieldCapacity: insight.capacity,
    triggerSuggestion: insight.suggestion,
    learning: insight.learning, // what the app is still waiting for, in plain words
  };
}

// Devices report hourly, so a soil-moisture ingest is the moment to notice a field crossing its
// trigger without anyone opening the app (R-011). Runs after the reading is saved and never fails
// the device's request; the alert rules (one open alert, quiet after done) stop repeats.
export async function adviseAfterIngest(ctx: { ownerId: string; fieldId: string; readings: Reading[] }, now = new Date()): Promise<void> {
  const moisture = ctx.readings.filter((r) => r.type === 'soil_moisture');
  if (!moisture.length) return;
  try {
    const field = await getField(ctx.ownerId, ctx.fieldId);
    if (!field.irrigated || !field.trigger || !field.cropProfile) return;
    if (moisture.every((r) => r.value >= field.trigger!.value)) return; // the common case: nothing to do
    if (await hasOpenAlert(ctx.ownerId, ctx.fieldId)) return; // already raised: skip the full models every hour
    await fieldAdvice(ctx.ownerId, ctx.fieldId, now);
  } catch (e) {
    console.error('advice after ingest failed', e);
  }
}

export async function plantingAdvice(ownerId: string, fieldId: string) {
  const field = await getField(ownerId, fieldId);
  const farm = await getFarm(ownerId, field.farmId);
  const { lat, lon } = requireLocation(farm.latitude, farm.longitude);
  const crop = toCrop(field.cropProfile);
  const history = await getWeather(farm).getHistory(lat, lon);
  return { weeks: rankPlantingWeeks(crop, history) };
}

export async function farmWeather(ownerId: string, farmId: string, now = new Date()) {
  const farm = await getFarm(ownerId, farmId);
  const { lat, lon } = requireLocation(farm.latitude, farm.longitude);
  const weather = await getWeather(farm).getForecast(lat, lon, now);
  return {
    rainNext48hMm: weather.rainNext48hMm,
    overnightLowC: weather.overnightLowC,
    hours: weather.hours,
    simulated: farm.demoWeather, // the page says when a demo farm's weather is scripted
  };
}
