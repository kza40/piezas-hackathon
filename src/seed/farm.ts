import type { Crop, DayForecast, FeatureLook, FieldId, FieldSeed, Level, Metric, Range, WaterLook, WaterState } from '../types';

export const FIELD_SEEDS: FieldSeed[] = [
  { id: 'A', name: 'North Wheat', crop: 'Wheat', mi: [30, 45], ac: 86, stage: 'Tillering', soil: 'Clay loam' },
  { id: 'B', name: 'East Canola', crop: 'Canola', mi: [32, 45], ac: 64, stage: 'Rosette', soil: 'Loam' },
  { id: 'C', name: 'South Barley', crop: 'Barley', mi: [28, 42], ac: 72, stage: 'Stem elongation', soil: 'Silt loam' },
  { id: 'D', name: 'West Oats', crop: 'Oats', mi: [28, 42], ac: 58, stage: 'Tillering', soil: 'Loam' },
  { id: 'E', name: 'Creek Alfalfa', crop: 'Alfalfa', mi: [35, 50], ac: 41, stage: 'Early bud', soil: 'Sandy loam' },
  { id: 'F', name: 'Blueberry Hill', crop: 'Blueberries', mi: [35, 50], ac: 22, stage: 'Fruit set', soil: 'Sandy loam, mulched', phr: [4.5, 5.5] },
];

/** Defaults used when a farmer adds a new parcel from their profile. */
export const CROP_DEFAULTS: Record<Crop, { mi: Range; stage: string; soil: string; phr?: Range; physics: { d: number; s: number; p: number; e: number } }> = {
  Wheat: { mi: [30, 45], stage: 'Tillering', soil: 'Clay loam', physics: { d: 0.11, s: 11.5, p: 6.3, e: 0.5 } },
  Canola: { mi: [32, 45], stage: 'Rosette', soil: 'Loam', physics: { d: 0.08, s: 12.5, p: 6.7, e: 0.6 } },
  Barley: { mi: [28, 42], stage: 'Stem elongation', soil: 'Silt loam', physics: { d: 0.06, s: 12, p: 6.8, e: 0.5 } },
  Oats: { mi: [28, 42], stage: 'Tillering', soil: 'Loam', physics: { d: 0.07, s: 11.8, p: 6.5, e: 0.6 } },
  Alfalfa: { mi: [35, 50], stage: 'Early bud', soil: 'Sandy loam', physics: { d: 0.05, s: 14, p: 7.0, e: 1.25 } },
  Blueberries: { mi: [35, 50], stage: 'Fruit set', soil: 'Sandy loam, mulched', phr: [4.5, 5.5], physics: { d: 0.09, s: 20, p: 5.1, e: 0.7 } },
};

/** Map centres used for farmer-added parcels (away from the seed six). */
export const CUSTOM_FIELD_SLOTS: [number, number][] = [
  [150, 150],
  [400, 150],
  [650, 150],
  [150, 370],
  [400, 370],
  [650, 370],
  [250, 260],
  [550, 260],
];

export function polyAround(cx: number, cy: number, rw = 72, rh = 56): string {
  const pts: [number, number][] = [
    [cx - rw, cy - rh + 10],
    [cx - rw * 0.25, cy - rh],
    [cx + rw * 0.35, cy - rh + 8],
    [cx + rw, cy - rh * 0.15],
    [cx + rw * 0.85, cy + rh * 0.65],
    [cx + rw * 0.05, cy + rh],
    [cx - rw * 0.8, cy + rh * 0.75],
    [cx - rw, cy + rh * 0.05],
  ];
  return pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
}

/**
 * Woodland outside the crop parcels — windbreaks, creek banks, and the
 * woodlot around the farmstead. Coordinates match the 800×520 map.
 */
export const TREES: [number, number][] = [
  // North windbreak
  [18, 18], [48, 12], [78, 22], [110, 10], [145, 18], [190, 8], [230, 16], [270, 10],
  [310, 20], [360, 8], [410, 14], [455, 6], [500, 16], [545, 8], [590, 18], [635, 10],
  [680, 16], [725, 8], [765, 18], [792, 12],
  // West woodlot
  [12, 70], [22, 110], [10, 155], [24, 200], [14, 250], [26, 300], [12, 350], [22, 400],
  [10, 450], [28, 490], [48, 505], [90, 510], [130, 500],
  // East ridge / blueberry edge
  [790, 70], [805, 120], [788, 165], [810, 210], [795, 255], [808, 310], [790, 360],
  [805, 410], [785, 455], [760, 500], [720, 512],
  // Creek corridor & pond woods
  [450, 230], [470, 270], [455, 320], [480, 370], [460, 420], [485, 470], [450, 505],
  [510, 430], [545, 450], [580, 470], [610, 495], [650, 485], [690, 470],
  [700, 430], [735, 415], [760, 390], [745, 350], [710, 370], [680, 395],
  // South pasture fringe
  [180, 505], [230, 512], [280, 500], [330, 510], [380, 498], [420, 508],
  // Gaps between north / south blocks
  [300, 220], [320, 235], [545, 225], [565, 240],
];

/** Distant ridges north of the farm (map x, peak height, base width). */
export const RIDGES: { x: number; h: number; w: number }[] = [
  { x: -120, h: 90, w: 220 },
  { x: 80, h: 140, w: 280 },
  { x: 280, h: 110, w: 240 },
  { x: 480, h: 160, w: 300 },
  { x: 680, h: 125, w: 260 },
  { x: 880, h: 95, w: 220 },
];

/** Meadow / scrub patches painted under the trees (open land, not yellow dirt). */
export const MEADOWS: string[] = [
  '0,0 800,0 800,55 0,70',
  '0,0 55,0 70,520 0,520',
  '740,0 800,0 800,520 755,520',
  '0,480 800,520 800,520 0,520',
  '430,210 520,205 535,520 445,520',
  '650,360 800,340 800,520 640,520',
];

export const FARM = { station: 'Farmstead weather station' };

export const HL: Record<Level, [label: string, symbol: string]> = {
  ok: ['Healthy', '✓'],
  wn: ['Needs attention', '!'],
  cr: ['Critical', '▲'],
  in: ['Info', 'i'],
};

export const W: DayForecast[] = [
  { day: 'Today', temp: 16, rain: 10, mm: 4, wind: 0, sky: 'Sunny' },
  { day: 'Tomorrow', temp: 14, rain: 70, mm: 12, wind: 6, sky: 'Rain' },
  { day: 'Tue', temp: 11, rain: 85, mm: 14, wind: 14, sky: 'Heavy rain' },
  { day: 'Wed', temp: 13, rain: 30, mm: 9, wind: 1, sky: 'Cloudy' },
  { day: 'Thu', temp: 17, rain: 5, mm: 6, wind: 0, sky: 'Sunny' },
  { day: 'Fri', temp: 19, rain: 0, mm: 5, wind: 0, sky: 'Sunny' },
  { day: 'Sat', temp: 18, rain: 15, mm: 8, wind: 0, sky: 'Mixed' },
];

export const MET: Metric[] = [
  { key: 'm', name: 'Soil moisture', unit: '%' },
  { key: 'st', name: 'Soil temperature', unit: '°C', range: [8, 20] },
  { key: 'at', name: 'Air temperature', unit: '°C', range: [0, 28] },
  { key: 'h', name: 'Humidity', unit: '%', range: [40, 75] },
  { key: 'ph', name: 'Soil pH', unit: '', range: [6, 7.2] },
  { key: 'ec', name: 'Salinity (EC)', unit: ' mS/cm', range: [0.3, 1] },
  { key: 'l', name: 'Sunlight, peak today', unit: '%', range: [60, 100] },
];

/** Sensor posts sit in the four corners of each field, in map units from the centre. */
export const SENSOR_XY: [number, number][] = [
  [-70, -55],
  [70, -55],
  [-70, 60],
  [70, 60],
];

/**
 * Field parcels as irregular cadastral shapes (not perfect rectangles),
 * so the map reads like a real Ontario concession farm. Farmers can still
 * drag parcels in Edit layout to match their own place.
 */
export const POLY: Record<FieldId, string> = {
  A: '38,42 155,28 298,36 318,118 308,198 175,212 58,204 42,120',
  B: '338,34 455,26 528,42 548,125 538,202 420,214 348,198 332,110',
  F: '562,48 680,36 762,58 778,130 752,208 640,218 558,198 548,110',
  C: '42,258 150,246 262,252 278,360 268,478 140,492 48,470 36,350',
  D: '292,252 380,242 458,248 478,355 468,472 360,486 278,462 272,340',
  E: '498,262 580,248 655,268 668,340 648,402 560,412 492,388 482,310',
};

export const CC: Record<Crop, string> = {
  Wheat: '#d9a441',
  Canola: '#f2c80f',
  Barley: '#c4a14a',
  Oats: '#b8b070',
  Alfalfa: '#9a5fc0',
  Blueberries: '#3b4fa8',
};

export const WS: Record<WaterState, WaterLook> = {
  now: { t: 'Water now', c: 'var(--cn)', h: '#4a78b5', bg: 'var(--bgn)', f: '#8fbdf0' },
  check: { t: 'Check sensors', c: '#4d5560', h: '#7a828c', bg: '#e6e6e3', f: '#c9ccd0' },
  soon: { t: 'Water soon', c: 'var(--cs)', h: '#cf7f3a', bg: 'var(--bgs)', f: '#f6d27a' },
  rain: { t: 'Rain expected', c: 'var(--cr2)', h: '#6d78a8', bg: 'var(--bgr)', f: '#b9c4ec' },
  none: { t: 'No water needed', c: 'var(--c0)', h: '#4f8a63', bg: 'var(--bg0)', f: '#93d6ab' },
};

export const FB: Record<WaterState, FeatureLook> = {
  now: { bg: '#3d5f8f', fg: '#f6efd9', n: '#f0d6a0', c: 'WATERING REQUIRED' },
  check: { bg: '#8a9099', fg: '#14181d', n: '#14181d', c: 'CHECK SENSORS' },
  soon: { bg: '#d98f55', fg: '#1d1203', n: '#222a33', c: 'WATER SOON' },
  rain: { bg: '#5d6595', fg: '#f6efd9', n: '#f0d6a0', c: 'RAIN EXPECTED: HOLD OFF' },
  none: { bg: '#6f9a7c', fg: '#f6efd9', n: '#fbf3dd', c: 'NO WATERING NEEDED' },
};

export const NXT: Record<WaterState, string> = {
  now: 'Water lightly today, about 10 mm.',
  check: 'Check the probes and their power. No watering call until a sensor reads normally.',
  soon: 'Check this afternoon. Water this evening if it keeps drying.',
  rain: 'Rain is due tomorrow. Hold off watering.',
  none: 'Nothing to do today. Check again Thursday.',
};
