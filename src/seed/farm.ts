import type { Crop, DayForecast, FeatureLook, FieldId, FieldSeed, Level, Metric, WaterLook, WaterState } from '../types';

export const FIELD_SEEDS: FieldSeed[] = [
  { id: 'A', name: 'North Wheat', crop: 'Wheat', mi: [30, 45], ac: 86, stage: 'Tillering', soil: 'Clay loam' },
  { id: 'B', name: 'East Canola', crop: 'Canola', mi: [32, 45], ac: 64, stage: 'Rosette', soil: 'Loam' },
  { id: 'C', name: 'South Barley', crop: 'Barley', mi: [28, 42], ac: 72, stage: 'Stem elongation', soil: 'Silt loam' },
  { id: 'D', name: 'West Oats', crop: 'Oats', mi: [28, 42], ac: 58, stage: 'Tillering', soil: 'Loam' },
  { id: 'E', name: 'Creek Alfalfa', crop: 'Alfalfa', mi: [35, 50], ac: 41, stage: 'Early bud', soil: 'Sandy loam' },
  { id: 'F', name: 'Blueberry Hill', crop: 'Blueberries', mi: [35, 50], ac: 22, stage: 'Fruit set', soil: 'Sandy loam, mulched', phr: [4.5, 5.5] },
];

/**
 * Gravel farm lanes in map coordinates (the 2D map's 800×520 viewBox).
 * Every field has a lane on each side so equipment can get around it:
 * a perimeter loop, lanes between neighbours, creek-side tracks, and the barn drive.
 */
export const LANES: { from: [number, number]; to: [number, number]; w: number }[] = [
  { from: [16, 16], to: [784, 16], w: 12 },
  { from: [16, 16], to: [16, 508], w: 12 },
  { from: [16, 508], to: [784, 508], w: 12 },
  { from: [784, 16], to: [784, 508], w: 12 },
  { from: [328, 16], to: [328, 228], w: 10 },
  { from: [548, 16], to: [548, 228], w: 10 },
  { from: [270, 228], to: [270, 508], w: 10 },
  { from: [464, 228], to: [464, 508], w: 7 },
  { from: [494, 228], to: [494, 412], w: 7 },
  { from: [494, 412], to: [662, 412], w: 10 },
  { from: [662, 228], to: [662, 412], w: 10 },
  { from: [662, 412], to: [784, 412], w: 10 },
  { from: [721, 228], to: [721, 300], w: 9 },
];
/** Wooden decks where a lane or the concession crosses Willow Creek. */
export const BRIDGES: [number, number][] = [
  [478, 228],
  [468, 508],
];
/** Shade trees: field corners, farmstead, and a light windbreak just outside the lanes. */
export const TREES: [number, number][] = [
  [28, 28], [180, 28], [400, 28], [640, 28], [772, 32],
  [28, 120], [28, 360], [28, 494],
  [180, 494], [400, 494], [640, 528],
  [772, 120], [808, 300], [808, 400],
  [690, 380], [752, 392], [768, 462], [715, 478],
];

export const FARM = { location: 'Wellington County, ON', station: 'Farmstead weather station' };

export const PROFILE = {
  email: 'sam@willowcreekfarm.ca',
  phone: '(519) 555-0142',
  since: 2011,
  alerts: 'Text + email for critical alerts',
  crew: [
    { name: 'Priya Natarajan', role: 'Farm manager', on: true },
    { name: 'Luis Ortega', role: 'Field worker', on: true },
    { name: 'Dale Morrison', role: 'Agronomist', on: false },
  ],
};

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

export const POLY: Record<FieldId, string> = {
  A: '40,40 300,30 320,200 60,215',
  B: '335,30 520,40 540,210 345,205',
  F: '555,45 760,60 750,210 565,212',
  C: '50,250 255,242 265,470 70,482',
  D: '285,242 455,236 462,470 295,472',
  E: '500,255 650,262 655,400 510,392',
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
  soon: { t: 'Water soon', c: 'var(--cs)', h: '#cf7f3a', bg: 'var(--bgs)', f: '#f6d27a' },
  rain: { t: 'Rain expected', c: 'var(--cr2)', h: '#6d78a8', bg: 'var(--bgr)', f: '#b9c4ec' },
  none: { t: 'No water needed', c: 'var(--c0)', h: '#4f8a63', bg: 'var(--bg0)', f: '#93d6ab' },
};

export const FB: Record<WaterState, FeatureLook> = {
  now: { bg: '#3d5f8f', fg: '#f6efd9', n: '#f0d6a0', c: 'WATERING REQUIRED' },
  soon: { bg: '#d98f55', fg: '#1d1203', n: '#222a33', c: 'WATER SOON' },
  rain: { bg: '#5d6595', fg: '#f6efd9', n: '#f0d6a0', c: 'RAIN EXPECTED: HOLD OFF' },
  none: { bg: '#6f9a7c', fg: '#f6efd9', n: '#fbf3dd', c: 'NO WATERING NEEDED' },
};

export const NXT: Record<WaterState, string> = {
  now: 'Water lightly today, about 10 mm.',
  soon: 'Check this afternoon. Water this evening if it keeps drying.',
  rain: 'Rain is due tomorrow. Hold off watering.',
  none: 'Nothing to do today. Check again Thursday.',
};
