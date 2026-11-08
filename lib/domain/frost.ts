import type { CropAdviceProfile } from './types';

export function frostWarning(crop: CropAdviceProfile, overnightLowC: number): string | null {
  if (crop.frostRiskC == null) return null;
  if (overnightLowC > crop.frostRiskC) return null;
  return `Frost warning: the forecast low is ${overnightLowC}°C, at or below the ${crop.frostRiskC}°C frost risk for ${crop.name}.`;
}