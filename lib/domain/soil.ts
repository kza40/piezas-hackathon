import type { CropAdviceProfile, SoilSample } from './types';

export function soilWarning(crop: CropAdviceProfile, sample: SoilSample): string | null {
  const parts: string[] = [];
  if (sample.ph != null && crop.phMin != null && crop.phMax != null) {
    if (sample.ph < crop.phMin) {
      parts.push(`the soil pH is ${sample.ph}, too low for ${crop.name} (aim ${crop.phMin} to ${crop.phMax})`);
    } else if (sample.ph > crop.phMax) {
      parts.push(`the soil pH is ${sample.ph}, too high for ${crop.name} (aim ${crop.phMin} to ${crop.phMax})`);
    }
  }
  if (sample.ec != null && crop.ecMax != null && sample.ec > crop.ecMax) {
    parts.push(`the salt level (EC) is ${sample.ec} dS/m, above the ${crop.ecMax} dS/m maximum for ${crop.name}`);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return `Soil warning: ${parts[0]}.`;
  return `Soil warning: ${parts[0]}, and ${parts[1]}.`;
}