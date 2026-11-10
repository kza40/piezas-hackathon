import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SEED = 20261107;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const args = process.argv.slice(2);
const nowArg = args.find((arg) => arg.startsWith('--now='))?.slice('--now='.length)
  ?? (args.includes('--now') ? args[args.indexOf('--now') + 1] : undefined);
const now = nowArg ? new Date(nowArg) : new Date();
if (!Number.isFinite(now.getTime())) throw new Error(`Invalid --now timestamp: ${nowArg}`);
now.setUTCMinutes(0, 0, 0);

let randomState = SEED >>> 0;
function random() {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 0x100000000;
}
const noise = (size: number) => (random() * 2 - 1) * size;
const round = (value: number, places = 1) => Number(value.toFixed(places));
const iso = (time: number) => new Date(time).toISOString().replace('.000Z', 'Z');

const cropProfiles = [{
  id: 'crop_blueberry', crop_name: 'Blueberry', ph_min: 4.5, ph_max: 5.2,
}];

const farms = [
  { id: 'farm_1', name: 'Fraser Ridge Berries', latitude: 49.05, longitude: -122.30, owner_id: 'owner_demo_1' },
  { id: 'farm_2', name: 'Pitt Meadow Blueberries', latitude: 49.22, longitude: -122.69, owner_id: 'owner_demo_1' },
  { id: 'farm_3', name: 'Riverbend Berry Co.', latitude: 49.17, longitude: -123.14, owner_id: 'owner_demo_2' },
];

const fields = [
  { id: 'field_1a', farm_id: 'farm_1', name: 'North Block', crop_profile_id: 'crop_blueberry', owner_id: 'owner_demo_1' },
  { id: 'field_1b', farm_id: 'farm_1', name: 'Creekside', crop_profile_id: 'crop_blueberry', owner_id: 'owner_demo_1' },
  { id: 'field_2a', farm_id: 'farm_2', name: 'East Rows', crop_profile_id: 'crop_blueberry', owner_id: 'owner_demo_1' },
  { id: 'field_2b', farm_id: 'farm_2', name: 'Lower Meadow', crop_profile_id: 'crop_blueberry', owner_id: 'owner_demo_1' },
  { id: 'field_3a', farm_id: 'farm_3', name: 'Orchard Edge', crop_profile_id: 'crop_blueberry', owner_id: 'owner_demo_2' },
  { id: 'field_3b', farm_id: 'farm_3', name: 'West Slope', crop_profile_id: 'crop_blueberry', owner_id: 'owner_demo_2' },
];

type Sensor = { id: string; field_id: string; name: string; reports: string[]; owner_id: string };
const sensors: Sensor[] = [];
for (const field of fields) {
  for (let n = 1; n <= 2; n++) sensors.push({
    id: `sensor_${field.id.slice(6)}${n}`, field_id: field.id, name: `Row ${n * 3} soil probe`,
    reports: ['soil_moisture', 'soil_temperature', 'soil_ec', 'soil_ph'], owner_id: field.owner_id,
  });
}
for (const farm of farms) {
  const firstField = fields.find((field) => field.farm_id === farm.id)!;
  sensors.push({ id: `sensor_${farm.id.slice(-1)}air`, field_id: firstField.id, name: 'Weather mast',
    reports: ['air_temperature', 'air_humidity'], owner_id: farm.owner_id });
}

const readings: Array<{ sensor_id: string; type: string; value: number; unit: string; time: string; source: 'simulated' }> = [];
const reports: Record<string, { unit: string; value: (hour: number, sensorIndex: number) => number }> = {
  soil_moisture: { unit: '%', value: (h, si) => 40 + si * 0.8 - h * 0.025 + 3 * Math.sin(h / 16) },
  soil_temperature: { unit: 'C', value: (h) => 9 + 3 * Math.sin((h % 24 - 8) / 24 * Math.PI * 2) },
  soil_ec: { unit: 'dS/m', value: (h) => 0.55 + 0.12 * Math.sin(h / 28) },
  soil_ph: { unit: 'pH', value: (h, si) => 5.05 + si * 0.04 + 0.015 * Math.sin(h / 90) },
  air_temperature: { unit: 'C', value: (h) => 6 + 7 * Math.sin((h % 24 - 9) / 24 * Math.PI * 2) },
  air_humidity: { unit: '%', value: (h) => 72 - 18 * Math.sin((h % 24 - 9) / 24 * Math.PI * 2) },
};

const start = now.getTime() - 14 * DAY;
const end = now.getTime();
const staleSensor = sensors.find((sensor) => sensor.id === 'sensor_2a2')!;
const deadSensor = sensors.find((sensor) => sensor.id === 'sensor_2b2')!;
for (let sensorIndex = 0; sensorIndex < sensors.length; sensorIndex++) {
  const sensor = sensors[sensorIndex];
  for (const type of sensor.reports) {
    for (let time = start; time <= end; time += HOUR) {
      if (sensor.id === deadSensor.id && time > end - 3 * DAY) continue;
      if (sensor.id === staleSensor.id && type === 'soil_moisture' && time > end - 8 * HOUR) continue;
      const hour = (time - start) / HOUR;
      if (sensor.id === 'sensor_1b1' && type === 'soil_ec' && Math.round(hour) === 91) continue;
      let value = reports[type].value(hour, sensorIndex);
      value += noise(type === 'soil_ph' ? 0.025 : type === 'soil_ec' ? 0.04 : type.includes('temperature') ? 0.7 : 1.1);

      // Named scenario profiles make important edge cases visible at the latest fresh reading.
      if (sensor.id === 'sensor_1a1' && type === 'soil_moisture' && time === end) value = 27.4;
      if (sensor.id === 'sensor_1a2' && type === 'soil_moisture' && time === end) value = 39.2;
      if (sensor.id === 'sensor_1b1' && type === 'soil_moisture' && time === end) value = 42.1;
      if (sensor.field_id.startsWith('field_2') && type === 'soil_moisture' && time >= end - 34 * HOUR && time <= end - 26 * HOUR) {
        value += 10 * (1 - Math.abs(time - (end - 30 * HOUR)) / (4 * HOUR));
      }
      if (sensor.id === 'sensor_1b1' && type === 'soil_ph' && time === end) value = 6.5;
      if (sensor.id === 'sensor_2a1' && type === 'soil_ec' && time === end) value = 1.35;
      if (sensor.id === 'sensor_2b1' && type === 'soil_moisture' && time === end - 7 * DAY) value = 90;
      if (sensor.id === 'sensor_3air' && type === 'air_temperature' && time === end) value = -1.8;
      if (sensor.field_id === 'field_3b' && time === end) {
        if (type === 'soil_moisture') value = sensor.id.endsWith('1') ? 41.2 : 43.1;
        if (type === 'soil_ph') value = sensor.id.endsWith('1') ? 5.0 : 5.2;
        if (type === 'soil_ec') value = sensor.id.endsWith('1') ? 0.55 : 0.62;
      }
      if (sensor.id === staleSensor.id && type === 'soil_moisture' && time === end - 8 * HOUR) value = 31.5;
      readings.push({ sensor_id: sensor.id, type, value: round(value, type === 'soil_ph' ? 2 : 1), unit: reports[type].unit, time: iso(time), source: 'simulated' });
    }
  }
}
readings.sort((a, b) => a.time.localeCompare(b.time) || a.sensor_id.localeCompare(b.sensor_id) || a.type.localeCompare(b.type));

const weatherForecast = farms.map((farm, farmIndex) => ({
  farm_id: farm.id,
  hours: Array.from({ length: 48 }, (_, i) => {
    const time = end + (i + 1) * HOUR;
    const hour = (time / HOUR) % 24;
    const rainy = farmIndex === 1 && i >= 12 && i < 20;
    const baseTemp = farmIndex === 0 ? 12 : farmIndex === 2 ? -1 : 5;
    return { time: iso(time), temp_c: round(baseTemp + 6 * Math.sin((hour - 9) / 24 * Math.PI * 2), 1), rain_mm: rainy ? round(1.4 + (i % 4) * 0.3, 1) : 0 };
  }),
}));

const weatherHistory = farms.flatMap((farm) => Array.from({ length: 52 }, (_, i) => {
  const week = i + 1;
  const seasonal = Math.sin(((week - 14) / 52) * Math.PI * 2);
  return { farm_id: farm.id, week, avg_temp_c: round(11 + 8 * seasonal, 1), avg_low_c: round(6 + 8 * seasonal, 1), frost_chance_pct: Math.round(Math.max(0, 55 - 50 * seasonal)), avg_rain_mm: round(24 + 18 * Math.cos((week / 52) * Math.PI * 2), 1) };
}));

const outDir = resolve('data/synthetic');
await mkdir(outDir, { recursive: true });
const writeJson = async (name: string, value: unknown) => writeFile(resolve(outDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
await Promise.all([
  writeJson('crop_profiles.json', cropProfiles), writeJson('farms.json', farms), writeJson('fields.json', fields),
  writeJson('sensors.json', sensors), writeJson('weather_forecast.json', weatherForecast), writeJson('weather_history.json', weatherHistory),
  writeFile(resolve(outDir, 'readings.csv'), [
    'sensor_id,type,value,unit,time,source',
    ...readings.map((r) => [r.sensor_id, r.type, r.value, r.unit, r.time, r.source].join(',')),
  ].join('\n') + '\n', 'utf8'),
  writeFile(resolve(outDir, 'scenarios.md'), `# Synthetic data scenarios\n\n- Moisture contrast: North Block (` + '`field_1a`' + `); the final readings only are set to 27.4% (Row 3) and 39.2% (Row 6), so Row 3 drops about 7 points in its last hour; over the day the two probes agree within a few points. These are fixture values, not calibrated irrigation thresholds.\n- Typical demo field: West Slope (` + '`field_3b`' + `); probe pH values are within the published blueberry preference; EC is illustrative only.\n- pH above preference: Creekside (` + '`field_1b`' + `), Row 3 pH is 6.5.\n- Elevated EC example: East Rows (` + '`field_2a`' + `), Row 3 EC is 1.35 dS/m; no soil salinity classification is implied.\n- Stale sensor: ` + '`sensor_2a2`' + ` last reports soil moisture 8 hours before now.\n- Dead sensor: ` + '`sensor_2b2`' + ` has no readings in the final 3 days.\n- Gaps: ` + '`sensor_1b1`' + ` soil EC omits one hour.\n- Glitch: ` + '`sensor_2b1`' + ` soil moisture has one 90% reading, a week before now (hour 168).\n- Cold night: ` + '`sensor_3air`' + ` ends with -1.8 C; farm 3's forecast includes sub-zero periods. This is not a crop-stage frost warning.\n- Rain event: farm 2 has rain in forecast hours 13 to 20 (after now). The readings are not tied to it, and there is no rain in the past data.\n\nFixed random seed: ${SEED}. Generated now: ${iso(end)}.\n`, 'utf8'),
]);
console.log(`Wrote synthetic data to ${outDir} (seed ${SEED}, now ${iso(end)}, ${readings.length} readings).`);
