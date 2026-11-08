import type { CropAdviceProfile, WeekClimate } from './types';

export interface PlantingWeekRank {
  week: number;
  score: number;
  reason: string;
}

// Prefer low frost chance, mild temps (~8–18°C), and moderate rain.
export function rankPlantingWeeks(crop: CropAdviceProfile, weeks: WeekClimate[], limit = 5): PlantingWeekRank[] {
  const scored = weeks.map((w) => {
    const frostPenalty = w.frostChancePct * 2;
    const tempIdeal = 13;
    const tempPenalty = Math.abs(w.avgTempC - tempIdeal) * 3;
    const rainIdeal = 25;
    const rainPenalty = Math.abs(w.avgRainMm - rainIdeal) * 0.5;
    const frostFloor = crop.frostRiskC ?? 0;
    const lowPenalty = w.avgLowC < frostFloor ? (frostFloor - w.avgLowC) * 8 : 0;
    const score = 100 - frostPenalty - tempPenalty - rainPenalty - lowPenalty;
    const reason = `Week ${w.week}: about ${w.frostChancePct}% frost chance, avg ${w.avgTempC}°C (lows ${w.avgLowC}°C), ~${w.avgRainMm} mm rain — suitable for ${crop.name}.`;
    return { week: w.week, score, reason };
  });
  return scored.sort((a, b) => b.score - a.score || a.week - b.week).slice(0, limit);
}