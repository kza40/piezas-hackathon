import {
  HEAVY_RAIN_MM,
  STALE_MOISTURE_MS,
  type CropAdviceProfile,
  type MoistureSample,
  type WeatherForecast,
} from './types';

export type WateringStatus = 'water_today' | 'wait' | 'no_recent_reading' | 'check_sensors' | 'not_configured' | 'rain_fed';

export interface WateringAdvice {
  status: WateringStatus;
  label: 'Water today' | 'Wait' | 'No recent reading' | 'Check sensors' | 'Not configured' | 'Rain-fed';
  reason: string;
  driestSensorId: string | null;
  driestSensorName: string | null;
  driestValue: number | null;
  sensors: { sensorId: string; sensorName: string; fresh: boolean }[];
}

/** The field's own watering setup (R-009, R-021). Samples should come from trusted sensors only (R-022). */
export interface FieldSetup {
  irrigated: boolean;
  trigger: number | null; // the farmer's saved soil-moisture trigger, %
  faultySensors?: number; // sensors left out as faulty (R-022), so "no reading" is not claimed when they report
}

export function wateringAdvice(
  crop: CropAdviceProfile,
  samples: MoistureSample[],
  forecast: WeatherForecast,
  now: Date,
  setup: FieldSetup,
): WateringAdvice {
  const sensors = samples.map((s) => ({
    sensorId: s.sensorId,
    sensorName: s.sensorName,
    fresh: now.getTime() - Date.parse(s.time) <= STALE_MOISTURE_MS,
  }));
  const result = (status: WateringStatus, label: WateringAdvice['label'], reason: string, driest: MoistureSample | null): WateringAdvice => ({
    status,
    label,
    reason,
    driestSensorId: driest?.sensorId ?? null,
    driestSensorName: driest?.sensorName ?? null,
    driestValue: driest?.value ?? null,
    sensors,
  });

  const fresh = samples.filter((_, i) => sensors[i].fresh);
  if (fresh.length === 0 && (setup.faultySensors ?? 0) > 0) {
    return result('check_sensors', 'Check sensors', 'Every soil moisture sensor in this field needs checking, so there is no watering advice until one reads normally.', null);
  }
  if (fresh.length === 0) return result('no_recent_reading', 'No recent reading', 'No soil moisture reading in the last 6 hours.', null);

  let driest = fresh[0];
  for (const s of fresh) {
    if (s.value < driest.value) driest = s;
  }

  if (!setup.irrigated) {
    const dry = forecast.rainNext48hMm < 1 ? ' No rain is forecast in the next 48 hours.' : '';
    return result('rain_fed', 'Rain-fed', `${driest.sensorName} reads ${driest.value}% soil moisture. This field is rain-fed, so there is no watering advice.${dry}`, driest);
  }

  if (setup.trigger == null) {
    return result(
      'not_configured',
      'Not configured',
      `${driest.sensorName} reads ${driest.value}% soil moisture. Irrigation guidance is not configured: save a soil-moisture trigger for this field.`,
      driest,
    );
  }

  if (driest.value >= setup.trigger) {
    return result('wait', 'Wait', `${driest.sensorName} is at ${driest.value}% soil moisture, above your ${setup.trigger}% trigger for this ${crop.name} field.`, driest);
  }

  if (forecast.rainNext48hMm >= HEAVY_RAIN_MM) {
    return result(
      'wait',
      'Wait',
      `${driest.sensorName} is dry at ${driest.value}%, but about ${forecast.rainNext48hMm.toFixed(1)} mm of rain is expected in the next 48 hours.`,
      driest,
    );
  }

  return result(
    'water_today',
    'Water today',
    `${driest.sensorName} is at ${driest.value}% soil moisture (below your ${setup.trigger}% trigger), and little rain is forecast in the next 48 hours.`,
    driest,
  );
}
