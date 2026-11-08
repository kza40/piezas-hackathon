import {
    HEAVY_RAIN_MM,
    STALE_MOISTURE_MS,
    type CropAdviceProfile,
    type MoistureSample,
    type WeatherForecast,
  } from './types';
  
  export type WateringStatus = 'water_today' | 'wait' | 'no_recent_reading';
  
  export interface WateringAdvice {
    status: WateringStatus;
    label: 'Water today' | 'Wait' | 'No recent reading';
    reason: string;
    driestSensorName: string | null;
    driestValue: number | null;
    sensors: { sensorId: string; sensorName: string; fresh: boolean }[];
  }
  
  export function wateringAdvice(
    crop: CropAdviceProfile,
    samples: MoistureSample[],
    forecast: WeatherForecast,
    now = new Date(),
  ): WateringAdvice {
    const sensors = samples.map((s) => ({
      sensorId: s.sensorId,
      sensorName: s.sensorName,
      fresh: now.getTime() - Date.parse(s.time) <= STALE_MOISTURE_MS,
    }));
  
    const fresh = samples.filter((_, i) => sensors[i].fresh);
    if (fresh.length === 0) {
      return {
        status: 'no_recent_reading',
        label: 'No recent reading',
        reason: 'No soil moisture reading in the last 6 hours.',
        driestSensorName: null,
        driestValue: null,
        sensors,
      };
    }
  
    let driest = fresh[0];
    for (const s of fresh) {
      if (s.value < driest.value) driest = s;
    }
  
    if (crop.moistureMin == null) {
      return {
        status: 'wait',
        label: 'Wait',
        reason: `${driest.sensorName} reads ${driest.value}%, but this crop has no moisture target yet.`,
        driestSensorName: driest.sensorName,
        driestValue: driest.value,
        sensors,
      };
    }
  
    if (driest.value >= crop.moistureMin) {
      return {
        status: 'wait',
        label: 'Wait',
        reason: `${driest.sensorName} is at ${driest.value}% soil moisture, within the range for ${crop.name}.`,
        driestSensorName: driest.sensorName,
        driestValue: driest.value,
        sensors,
      };
    }
  
    if (forecast.rainNext48hMm >= HEAVY_RAIN_MM) {
      return {
        status: 'wait',
        label: 'Wait',
        reason: `${driest.sensorName} is dry at ${driest.value}%, but about ${forecast.rainNext48hMm.toFixed(1)} mm of rain is expected in the next 48 hours.`,
        driestSensorName: driest.sensorName,
        driestValue: driest.value,
        sensors,
      };
    }
  
    return {
      status: 'water_today',
      label: 'Water today',
      reason: `${driest.sensorName} is at ${driest.value}% soil moisture (below the ${crop.moistureMin}% minimum for ${crop.name}), and little rain is forecast in the next 48 hours.`,
      driestSensorName: driest.sensorName,
      driestValue: driest.value,
      sensors,
    };
  }