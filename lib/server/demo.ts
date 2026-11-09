// Demo scenarios: a demo field shows one designed situation, so a demo farm always has fields that need
// attention next to fields that are fine. Pure and deterministic, like the simulator it builds on:
// the simulator gives each spot its temperatures, humidity, EC and pH; a scenario then writes the soil
// moisture story (and pH, or missing hours) that leads the field models (lib/ml) to that situation.
//
// Waterings happen at 6 am farm time on fixed days before today, so a demo regenerated during the day
// keeps the same events (and the farmer's labels for them) until midnight.
import type { Reading } from './readings';

export const DEMO_SCENARIOS = {
  water_today: 'Irrigated, last watered 5 days ago: below its saved trigger, so Water today and an alert',
  wait_window: 'Irrigated, watered 2 days ago: above its trigger, with a water-by window',
  stuck_sensor: 'Irrigated, one probe stuck on one value: left out of the advice and marked Check sensor',
  setup: 'Irrigated, no trigger yet: Not configured, with a suggested trigger from its last soaking',
  steady: 'Rain-fed and fine: soil moisture follows the recorded rain',
  low_ph: 'Rain-fed, soil pH below the crop range: a soil warning',
  offline: 'Every probe stopped reporting 10 hours ago: No recent reading',
} as const;
export type DemoScenario = keyof typeof DEMO_SCENARIOS;
export const isDemoScenario = (v: unknown): v is DemoScenario => typeof v === 'string' && v in DEMO_SCENARIOS;

const HOUR = 3_600_000;
const DRY_PER_HOUR = 0.065; // points of soil moisture lost an hour between waterings
const CAPACITY = 34; // where this soil settles after a soaking (sandy loam, on the probes' scale)
const WATERING = 10; // points a watering adds before the excess drains away

// Days before today (farm time) on which the farmer watered, by scenario.
const WATERED_DAYS: Partial<Record<DemoScenario, number[]>> = {
  water_today: [9, 5],
  wait_window: [7, 2],
  stuck_sensor: [7, 2],
  setup: [10, 4],
};
const STUCK_VALUE = 12;
const STUCK_HOURS = 30;
const OFFLINE_HOURS = 10;
const LOW_PH = 5.2;

/** Each spot's readings with the scenario applied; `rainMm` is the farm's recorded rain by hour (ms epoch). */
export function applyScenario(
  scenario: DemoScenario,
  spots: Reading[][],
  longitude: number,
  rainMm: Map<number, number> = new Map(),
): Reading[][] {
  const tz = Math.round(longitude / 15) * HOUR; // farm time, close enough for "6 am"
  return spots.map((readings, spot) => {
    const times = [...new Set(readings.map((r) => r.time))].sort();
    if (!times.length) return readings;
    const end = Date.parse(times.at(-1)!);
    const today = Math.floor((end + tz) / (24 * HOUR)); // farm-local day number
    const waterings = new Set((WATERED_DAYS[scenario] ?? []).map((d) => (today - d) * 24 * HOUR + 6 * HOUR - tz));
    const offset = spot * 1.6; // neighbouring probes read a little differently
    const capacity = CAPACITY + offset * 0.5;
    let moisture = capacity - 3;
    let excess = 0;
    const byTime = new Map<string, number>();
    for (const [i, time] of times.entries()) {
      const t = Date.parse(time);
      // Irrigated scenarios water on their days; rain-fed ones follow the recorded rain.
      const water = waterings.has(t) ? WATERING : scenario === 'steady' || scenario === 'low_ph' ? rainMm.get(t) ?? 0 : 0;
      if (water > 0) {
        const room = Math.max(0, capacity - moisture);
        moisture += Math.min(water, room);
        excess += water - Math.min(water, room);
      }
      excess *= 0.75;
      moisture = Math.max(8, moisture - DRY_PER_HOUR);
      const wobble = 0.12 * Math.sin(i * 0.9 + spot) + 0.08 * Math.sin(i * 0.27 + 2 * spot); // probe noise
      let value = moisture + excess + wobble - offset * 0.3;
      if (scenario === 'stuck_sensor' && spot === 2 && end - t < STUCK_HOURS * HOUR) value = STUCK_VALUE;
      byTime.set(time, Math.round(value * 10) / 10);
    }
    return readings
      .filter((r) => !(scenario === 'offline' && end - Date.parse(r.time) < OFFLINE_HOURS * HOUR))
      .map((r) => {
        if (r.type === 'soil_moisture') return { ...r, value: byTime.get(r.time)! };
        if (r.type === 'soil_ph' && scenario === 'low_ph') return { ...r, value: Math.round((LOW_PH + 0.05 * Math.sin(Date.parse(r.time) / 36e6 + spot)) * 100) / 100 };
        return r;
      });
  });
}
