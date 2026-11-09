import { farmApi } from './api';
import { F } from './seed/simulate';
import { S } from './state';
import type { AppState, LiveHistory, LiveSensor, LiveWeather, MetricKey } from './types';

function ageHours(iso: string | undefined, now: number): number {
  if (!iso) return 999;
  return Math.max(0, (now - Date.parse(iso)) / 36e5);
}

function applySensorsToField(fieldId: string, sensors: LiveSensor[]) {
  const f = F.find((x) => x.id === fieldId);
  if (!f) return;
  const ms = sensors.map((s) => s.m).filter((v): v is number => v != null);
  const sts = sensors.map((s) => s.st).filter((v): v is number => v != null);
  const phs = sensors.map((s) => s.ph).filter((v): v is number => v != null);
  const hs = sensors.map((s) => s.h).filter((v): v is number => v != null);
  if (ms.length) f.m = Math.round((ms.reduce((a, b) => a + b, 0) / ms.length) * 10) / 10;
  if (sts.length) {
    f.st = Math.round((sts.reduce((a, b) => a + b, 0) / sts.length) * 10) / 10;
    f.stMax = Math.max(...sts);
  }
  if (phs.length) f.ph = Math.round((phs.reduce((a, b) => a + b, 0) / phs.length) * 100) / 100;
  if (hs.length) f.h = Math.round(hs.reduce((a, b) => a + b, 0) / hs.length);
  const online = sensors.filter((s) => s.online).length;
  f.s = [online, sensors.length];
  const lo = f.mi[0];
  f.hl = f.m < lo - 5 ? 'cr' : f.m < lo ? 'wn' : 'ok';
}

let generation = 0;
let onLoaded: (() => void) | null = null;
/** Called after live data arrives in the background (main.ts redraws). */
export const onLiveDataLoaded = (fn: () => void) => {
  onLoaded = fn;
};

/**
 * Pull weather, advice, sensors, then alerts (advice may open new ones). Everything is gathered first and
 * swapped into the state in one step, and only by the newest load for the same farm: a slow load never
 * overwrites a newer one, and nothing arrives for a farm after the farmer signs out or switches.
 */
export async function loadLiveData(): Promise<boolean> {
  const gen = ++generation;
  const farmId = S.farmId;
  const fields = [...F];
  if (!farmId) {
    S.liveWeather = null;
    S.liveAdvice = {};
    S.liveAlerts = [];
    S.liveSensors = {};
    S.liveMoistureSeries = {};
    S.liveHistory = {};
    return true;
  }
  const now = Date.now();
  const next = {
    weather: null as LiveWeather | null,
    advice: {} as AppState['liveAdvice'],
    alerts: [] as AppState['liveAlerts'],
    sensors: {} as AppState['liveSensors'],
    series: {} as AppState['liveMoistureSeries'],
    history: {} as AppState['liveHistory'],
  };
  try {
    next.weather = await farmApi.getWeather(farmId).catch(() => null);

    await Promise.all(
      fields.map(async (f) => {
        try {
          const adv = await farmApi.getAdvice(f.id);
          next.advice[f.id] = {
            status: adv.watering.status,
            label: adv.watering.label,
            reason: adv.watering.reason,
            soilWarning: adv.soilWarning,
            frostWarning: adv.frostWarning,
          };
        } catch {
          /* ignore */
        }
        try {
          const { sensors } = await farmApi.listSensors(f.id);
          const live: LiveSensor[] = sensors.map((s) => {
            const m = s.latest.soil_moisture;
            const st = s.latest.soil_temperature;
            const ph = s.latest.soil_ph;
            const h = s.latest.air_humidity;
            const newest = [m?.time, st?.time, ph?.time, h?.time].filter(Boolean).sort().at(-1) as string | undefined;
            const age = ageHours(newest, now);
            return {
              id: s.id,
              name: s.name,
              m: m?.value ?? null,
              st: st?.value ?? null,
              ph: ph?.value ?? null,
              h: h?.value ?? null,
              online: age <= 6,
              ageHours: Math.round(age),
            };
          });
          next.sensors[f.id] = live;
        } catch {
          /* ignore */
        }
        try {
          const { sensors } = await farmApi.getReadings(f.id, 7);
          const TYPE_TO_KEY: Record<string, MetricKey> = {
            soil_moisture: 'm',
            soil_temperature: 'st',
            soil_ph: 'ph',
            soil_ec: 'ec',
            air_temperature: 'at',
            air_humidity: 'h',
          };
          const HOURS = 168;
          const hourKeys: string[] = [];
          for (let i = HOURS - 1; i >= 0; i--) {
            hourKeys.push(new Date(now - i * 36e5).toISOString().slice(0, 13));
          }
          const idx = new Map(hourKeys.map((h, i) => [h, i]));
          // No past rain yet: the farm weather endpoint is a forecast (now onward), so it would draw
          // "Rain 0 mm" over every past week. The chart leaves rain out until a rain history exists.
          const rain: number[] = [];
          const liveSens = next.sensors[f.id] ?? [];
          const histSensors = sensors.map((block) => {
            const meta = liveSens.find((s) => s.id === block.sensorId);
            const vals: LiveHistory['sensors'][0]['vals'] = {};
            for (const [type, key] of Object.entries(TYPE_TO_KEY)) {
              const pts = block.series[type] ?? [];
              if (!pts.length) continue;
              const arr: (number | null)[] = Array(HOURS).fill(null);
              for (const p of pts) {
                const i = idx.get(p.time.slice(0, 13));
                if (i != null) arr[i] = p.value;
              }
              vals[key] = arr;
            }
            return {
              id: block.sensorId,
              name: meta?.name ?? block.sensorId.slice(0, 8),
              ageHours: meta?.ageHours ?? 999,
              vals,
            };
          });
          next.history[f.id] = { hours: hourKeys, rain, sensors: histSensors };

          const byHour = new Map<string, number[]>();
          for (const block of sensors) {
            for (const pt of block.series.soil_moisture ?? []) {
              const hour = pt.time.slice(0, 13);
              const arr = byHour.get(hour) ?? [];
              arr.push(pt.value);
              byHour.set(hour, arr);
            }
          }
          const series = [...byHour.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, vs]) => vs.reduce((x, y) => x + y, 0) / vs.length);
          const step = Math.max(1, Math.floor(series.length / 56));
          next.series[f.id] = series.filter((_, i) => i % step === 0);
        } catch {
          /* ignore */
        }
      }),
    );

    // After getAdvice (which may open alerts), refresh so new ones show immediately.
    try {
      const { alerts } = await farmApi.listAlerts('open');
      next.alerts = alerts.map((x) => ({
        id: x.id,
        fieldId: x.fieldId,
        message: x.message,
        createdAt: x.createdAt,
      }));
    } catch {
      next.alerts = [];
    }
  } catch {
    /* keep UI usable */
  }
  if (gen !== generation || S.farmId !== farmId) return false; // a newer load, or another farm, owns the state
  S.liveWeather = next.weather;
  S.liveAdvice = next.advice;
  S.liveAlerts = next.alerts;
  S.liveSensors = next.sensors;
  S.liveMoistureSeries = next.series;
  S.liveHistory = next.history;
  for (const [id, live] of Object.entries(next.sensors)) applySensorsToField(id, live);
  return true;
}

/** Wait for fresh live data (after the farmer changes something whose result they expect to see). */
export async function refreshLiveData() {
  await loadLiveData();
}

/** Show what is already known now and fill in live data when it arrives (sign-in, adding a field). */
export function loadLiveDataInBackground() {
  void loadLiveData().then((applied) => {
    if (applied) onLoaded?.();
  });
}
