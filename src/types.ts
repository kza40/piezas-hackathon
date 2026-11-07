export type FieldId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Crop = 'Wheat' | 'Canola' | 'Barley' | 'Oats' | 'Alfalfa' | 'Peas';
export type Health = 'ok' | 'wn' | 'cr';
export type Level = Health | 'in';
export type WaterState = 'now' | 'soon' | 'rain' | 'none';
export type SensorKey = 'm' | 'st' | 'ph' | 'ec';
export type StationKey = 'at' | 'h' | 'l';
export type MetricKey = SensorKey | StationKey;
export type Range = [min: number, max: number];
export type Page = 'login' | 'map' | 'dashboard' | 'field' | 'weather' | 'recs' | 'alerts' | 'settings' | 'profile';
export type MapLayer = 'water' | 'health' | 'moisture' | 'temp';
export type AlertFilter = Level | 'all';
export type Units = '°C' | '°F';

export interface FieldSeed {
  id: FieldId;
  name: string;
  crop: Crop;
  /** Ideal soil-moisture range for the crop, in percent. */
  mi: Range;
}

export interface Field extends FieldSeed {
  m: number;
  st: number;
  stMax: number;
  at: number;
  h: number;
  ph: number;
  ec: number;
  l: number;
  s: [online: number, total: number];
  hl: Health;
  stn: Record<StationKey, number[]>;
}

export interface Metric {
  key: MetricKey;
  name: string;
  unit: string;
  /** Ideal range; soil moisture has none here because it comes from the field's crop. */
  range?: Range;
}

export interface Sensor {
  id: string;
  f: FieldId;
  /** Hours since the last reading. */
  age: number;
  vals: Record<SensorKey, (number | null)[]>;
  /** Hour indexes of odd readings that are ignored. */
  gl: Record<SensorKey, Set<number>>;
}

export interface Alert {
  id: number;
  l: Level;
  t: string;
  f: FieldId | '';
  d: string;
  ago: string;
}

export interface Recommendation {
  id: number;
  f: FieldId;
  p: Level;
  t: string;
  w: string;
  c: string;
}

export interface DayForecast {
  day: string;
  temp: number;
  rain: number;
  mm: number;
  wind: number;
  sky: string;
}

export interface WaterLook {
  t: string;
  c: string;
  h: string;
  bg: string;
  f: string;
}

export interface FeatureLook {
  bg: string;
  fg: string;
  n: string;
  c: string;
}

export interface WaterLogEntry {
  f: FieldId;
  d: string;
  mm: number;
}

export interface AppState {
  page: Page;
  sel: FieldId;
  done: Record<number, true>;
  dis: Record<number, true>;
  flt: AlertFilter;
  mk: MetricKey;
  step: number;
  farm: string;
  units: Units;
  toast: string;
  v: { x: number; y: number; k: number };
  ly: MapLayer;
  off: Partial<Record<FieldId, [number, number]>>;
  name: string;
  role: string;
  wm: FieldId | null;
  fd: FieldId | null;
  edit: boolean;
  moved: boolean;
  log: WaterLogEntry[];
}
