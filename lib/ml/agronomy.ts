// Sourced agronomy constants for the trigger suggestion (R-024). See docs/crop-guidance.md.
//
// FAO Irrigation and Drainage Paper 56 (Allen et al., 1998):
// - Table 19: typical soil water at field capacity (θFC) and wilting point (θWP) by soil texture.
//   We keep the ratio θWP/θFC of each range's midpoints, so a wilting point can be put on the field's
//   own sensor scale from the field capacity we measure there.
// - Table 22: p, the fraction of available soil water a crop can use before it is stressed.

export interface Texture {
  name: string;
  fc: number; // θFC midpoint, m³/m³
  wp: number; // θWP midpoint, m³/m³
}

// Table 19 (midpoints of the published ranges).
const TEXTURES: Texture[] = [
  { name: 'silty clay loam', fc: 0.335, wp: 0.205 },
  { name: 'silty clay', fc: 0.36, wp: 0.23 },
  { name: 'sandy loam', fc: 0.23, wp: 0.11 },
  { name: 'loamy sand', fc: 0.15, wp: 0.065 },
  { name: 'silt loam', fc: 0.29, wp: 0.15 },
  { name: 'loam', fc: 0.25, wp: 0.12 },
  { name: 'sand', fc: 0.12, wp: 0.045 },
  { name: 'silt', fc: 0.32, wp: 0.17 },
  { name: 'clay', fc: 0.36, wp: 0.22 },
];
export const TEXTURE_NAMES = ['sand', 'loamy sand', 'sandy loam', 'loam', 'silt loam', 'silt', 'silty clay loam', 'silty clay', 'clay'];

// Textures Table 19 does not list. Checked first, so "clay loam" is not read as "loam" or "clay"
// (but "silty clay loam" is listed).
const UNLISTED = /\bsandy clay\b|(?<!silty )\bclay loam\b/;

/** The Table 19 texture named in a free-text soil type ("Sandy loam, mulched"), or null if none or unlisted. */
export function textureOf(soil: string): Texture | null {
  const s = soil.toLowerCase().replace('silt clay loam', 'silty clay loam');
  if (UNLISTED.test(s)) return null;
  return TEXTURES.find((t) => new RegExp(`\\b${t.name}\\b`).test(s)) ?? null;
}

// Table 22, p for each of our crop profiles (crop_profile.key).
const DEPLETION: Record<string, { p: number; row: string }> = {
  wheat: { p: 0.55, row: 'Wheat' },
  barley: { p: 0.55, row: 'Barley' },
  oats: { p: 0.55, row: 'Oats' },
  alfalfa: { p: 0.55, row: 'Alfalfa (hay)' },
  canola: { p: 0.6, row: 'Rapeseed, canola' },
  blueberry: { p: 0.5, row: 'Berries (bushes)' },
};

export const depletionFor = (cropKey: string) => DEPLETION[cropKey] ?? null;
