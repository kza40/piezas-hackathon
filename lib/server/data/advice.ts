import { badRequest } from '../errors';
import { getFarm, getField } from './farms';
import { listSensors, type Sensor } from './sensors';
import { openAlert } from './alerts';
import { wateringAdvice } from '../../domain/watering';
import { soilWarning } from '../../domain/soil';
import { frostWarning } from '../../domain/frost';
import { rankPlantingWeeks } from '../../domain/planting';
import type { CropAdviceProfile, MoistureSample, SoilSample } from '../../domain/types';
import { getWeather } from '../../weather/index';
import type { CropProfile } from './crops';

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

export async function fieldAdvice(ownerId: string, fieldId: string, now = new Date()) {
  const field = await getField(ownerId, fieldId);
  const farm = await getFarm(ownerId, field.farmId);
  const { lat, lon } = requireLocation(farm.latitude, farm.longitude);
  const sensors = await listSensors(ownerId, fieldId);
  const weather = await getWeather().getForecast(lat, lon, now);
  const crop = toCrop(field.cropProfile);
  const watering = wateringAdvice(crop, moistureSamples(sensors), weather, now);
  const soil = soilWarning(crop, soilSample(sensors));
  const frost = frostWarning(crop, weather.overnightLowC);
  const alert =
    watering.status === 'water_today' ? await openAlert(ownerId, fieldId, watering.reason, now) : null;
  return {
    watering,
    soilWarning: soil,
    frostWarning: frost,
    weather: {
      rainNext48hMm: weather.rainNext48hMm,
      overnightLowC: weather.overnightLowC,
      hours: weather.hours,
    },
    alert,
  };
}

export async function plantingAdvice(ownerId: string, fieldId: string) {
  const field = await getField(ownerId, fieldId);
  const farm = await getFarm(ownerId, field.farmId);
  const { lat, lon } = requireLocation(farm.latitude, farm.longitude);
  const crop = toCrop(field.cropProfile);
  const history = await getWeather().getHistory(lat, lon);
  return { weeks: rankPlantingWeeks(crop, history) };
}

export async function farmWeather(ownerId: string, farmId: string, now = new Date()) {
  const farm = await getFarm(ownerId, farmId);
  const { lat, lon } = requireLocation(farm.latitude, farm.longitude);
  const weather = await getWeather().getForecast(lat, lon, now);
  return {
    rainNext48hMm: weather.rainNext48hMm,
    overnightLowC: weather.overnightLowC,
    hours: weather.hours,
  };
}