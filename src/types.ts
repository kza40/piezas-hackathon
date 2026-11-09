/** Server field ids (UUIDs) or legacy seed letters used only for map layout. */
export type FieldId = string;
export type Crop = 'Wheat' | 'Canola' | 'Barley' | 'Oats' | 'Alfalfa' | 'Blueberries';
export const CROPS: Crop[] = ['Wheat', 'Canola', 'Barley', 'Oats', 'Alfalfa', 'Blueberries'];
export type Health = 'ok' | 'wn' | 'cr';
export type Level = Health | 'in';
export type WaterState = 'now' | 'soon' | 'rain' | 'none';
export type SensorKey = 'm' | 'st' | 'ph' | 'ec';
export type StationKey = 'at' | 'h' | 'l';
export type MetricKey = SensorKey | StationKey;
export type Range = [min: number, max: number];
export type Page = 'login' | 'map';
export type AuthMode = 'signin' | 'signup';
/** A full-detail view that opens over the map. */
export type PanelId = 'dashboard' | 'field' | 'weather' | 'recs' | 'alerts' | 'settings' | 'profile';
/** A summary card that sits on the map. */
export type CardId = 'profile' | 'field' | 'legend' | 'today' | 'weather' | 'alerts' | 'recs';
export type MapLayer = 'water' | 'health' | 'moisture' | 'temp';
export type AlertFilter = Level | 'all';
export type Units = '°C' | '°F';

export interface FieldSeed {
  id: FieldId;
  name: string;
  crop: Crop;
  /** Ideal soil-moisture range for the crop, in percent. */
  mi: Range;
  /** Area in acres. */
  ac: number;
  /** Current growth stage. */
  stage: string;
  soil: string;
  /** Ideal soil pH when the crop differs from the usual 6–7.2 (blueberries want acidic soil). */
  phr?: Range;
}

export interface Field extends FieldSeed {
  /** Key into POLY / seed sensors (letter A–F for demo parcels, or the field id for new ones). */
  layout: FieldId;
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
  panel: PanelId | null;
  /** Signed-in farmer id from GET /api/auth/me (cookie session). */
  farmerId: string | null;
  email: string;
  phone: string;
  /** Active farm from GET /api/farms (empty after a fresh sign-up). */
  farmId: string | null;
  farmLat: number | null;
  farmLng: number | null;
  authMode: AuthMode;
  /** Login / sign-up form error message. */
  authError: string;
  /** Email left in the login form after a failed attempt. */
  authEmail: string;
  /** Map cards the farmer has collapsed to their header. */
  min: Partial<Record<CardId, true>>;
  /** Every card hidden so only the map shows. */
  bare: boolean;
  /** Map shown in 3D rather than flat. */
  d3: boolean;
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
  /** Crop profiles from the API (id → profile), loaded after sign-in. */
  cropByName: Partial<Record<Crop, string>>;
  liveWeather: LiveWeather | null;
  liveAdvice: Record<string, LiveAdvice>;
  liveAlerts: LiveAlert[];
  liveSensors: Record<string, LiveSensor[]>;
  liveMoistureSeries: Record<string, number[]>;
  liveHistory: Record<string, LiveHistory>;
}

export interface LiveWeather {
  rainNext48hMm: number;
  overnightLowC: number;
  hours: { time: string; tempC: number; rainMm: number }[];
}
export interface LiveAdvice {
  label: string;
  reason: string;
  soilWarning: string | null;
  frostWarning: string | null;
}
export interface LiveAlert {
  id: string;
  fieldId: string;
  message: string;
  createdAt: string;
}


export interface LiveHistorySensor {
  id: string;
  name: string;
  ageHours: number;
  vals: Partial<Record<MetricKey, (number | null)[]>>;
}
export interface LiveHistory {
  /** Hour keys YYYY-MM-DDTHH, oldest → newest. */
  hours: string[];
  rain: number[];
  sensors: LiveHistorySensor[];
}
export interface LiveSensor {
  id: string;
  name: string;
  m: number | null;
  st: number | null;
  ph: number | null;
  h: number | null;
  online: boolean;
  ageHours: number;
}
