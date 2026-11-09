import { farmApi } from './api';
import { F } from './seed/simulate';
import { S } from './state';
import type { LiveHistory, LiveSensor, MetricKey } from './types';

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

/** Pull weather, advice, sensors, then alerts (advice may open new ones). */
export async function loadLiveData() {
  S.liveWeather = null;
  S.liveAdvice = {};
  S.liveAlerts = [];
  S.liveSensors = {};
  S.liveMoistureSeries = {};
  S.liveHistory = {};
  if (!S.farmId) return;
  const now = Date.now();
  try {
    const weather = await farmApi.getWeather(S.farmId).catch(() => null);
    if (weather) S.liveWeather = weather;

    await Promise.all(
      F.map(async (f) => {
        try {
          const adv = await farmApi.getAdvice(f.id);
          S.liveAdvice[f.id] = {
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
          S.liveSensors[f.id] = live;
          applySensorsToField(f.id, live);
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
          // Forecast hours are "now onward" — they barely overlap this past window,
          // so rain bars stay mostly empty unless a past precip source is added later.
          const rainByHour = new Map<string, number>();
          for (const h of S.liveWeather?.hours ?? []) {
            rainByHour.set(h.time.slice(0, 13), h.rainMm);
          }
          const rain = hourKeys.map((h) => rainByHour.get(h) ?? 0);
          const liveSens = S.liveSensors[f.id] ?? [];
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
          S.liveHistory[f.id] = { hours: hourKeys, rain, sensors: histSensors };

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
          S.liveMoistureSeries[f.id] = series.filter((_, i) => i % step === 0);
        } catch {
          /* ignore */
        }
      }),
    );

    // After getAdvice (which may open alerts), refresh so new ones show immediately.
    try {
      const { alerts } = await farmApi.listAlerts('open');
      S.liveAlerts = alerts.map((x) => ({
        id: x.id,
        fieldId: x.fieldId,
        message: x.message,
        createdAt: x.createdAt,
      }));
    } catch {
      S.liveAlerts = [];
    }
  } catch {
    /* keep UI usable */
  }
}

export async function refreshLiveData() {
  await loadLiveData();
}