// R-024, step 1: the field's field capacity, measured on its own sensors.
// After a soaking, extra water drains away quickly and then the soil levels off; the level where
// draining slows to a crawl (12 to 48 hours after the peak) is field capacity. Measuring it on the
// field's own sensors means cheap probes being off in absolute terms does not matter.
import { smooth, type WettingEvent } from './events';
import { HOUR, median, round1, shortDay, type SensorSeries } from './types';

export interface FieldCapacity {
  value: number; // soil moisture %, on the sensors' own scale
  from: string; // the event it was measured after (the newest one used)
  basis: string; // plain words: "the irrigation on Nov 3, 2 sensors"
  samples: number;
}

const SETTLED_DROP_PER_HOUR = 0.15;
const FROM_HOURS = 12;
const TO_HOURS = 48;

function settledAfter(points: { time: string; value: number }[], peak: number, nextEvent: number): number | null {
  const s = smooth(points).filter((p) => Date.parse(p.time) >= peak + FROM_HOURS * HOUR && Date.parse(p.time) < nextEvent);
  for (let i = 0; i + 3 < s.length; i++) {
    if (Date.parse(s[i].time) > peak + TO_HOURS * HOUR) break;
    if ((s[i].value - s[i + 3].value) / 3 < SETTLED_DROP_PER_HOUR) return s[i].value;
  }
  return null;
}

export function estimateFieldCapacity(sensors: SensorSeries[], events: WettingEvent[]): { capacity: FieldCapacity | null; needs: string | null } {
  const soakings = events.filter((e) => e.label !== 'none');
  if (!soakings.length) return { capacity: null, needs: 'a soaking rain or irrigation' };
  // Per event, the median across sensors. A light rain that never filled the soil settles lower than
  // field capacity, while every real soaking settles at it, so the highest event is the measurement.
  let best: { e: WettingEvent; value: number; n: number } | null = null;
  soakings.forEach((e, i) => {
    const next = i + 1 < soakings.length ? Date.parse(soakings[i + 1].start) : Infinity;
    const vs = sensors.map((s) => settledAfter(s.points, Date.parse(e.peak), next)).filter((v): v is number => v !== null);
    if (!vs.length) return;
    const value = median(vs);
    if (!best || value > best.value) best = { e, value, n: vs.length };
  });
  if (!best) return { capacity: null, needs: 'a dry day or two after a soaking, to see where the soil settles' };
  const { e, value, n } = best as { e: WettingEvent; value: number; n: number };
  return {
    capacity: {
      value: round1(value),
      from: e.start,
      basis: `the ${e.label === 'rain' ? 'rain' : 'irrigation'} on ${shortDay(e.start)}, ${n} sensor${n === 1 ? '' : 's'}`,
      samples: n,
    },
    needs: null,
  };
}
