import type { AppState, WaterLogEntry } from './types';

const OFFSETS_KEY = 'fw-off';
const LOG_KEY = 'fw-log';
const CARDS_KEY = 'fw-cards';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the change just won't survive a reload
  }
}

export const S: AppState = {
  page: 'login',
  panel: null,
  farmerId: null,
  email: '',
  phone: '',
  farmId: null,
  farmLat: null,
  farmLng: null,
  authMode: 'signin',
  authError: '',
  authEmail: '',
  ...{ min: {}, bare: false, d3: true, ...readJson<Partial<Pick<AppState, 'min' | 'bare' | 'd3'>>>(CARDS_KEY, {}) },
  sel: '',
  done: {},
  dis: {},
  flt: 'all',
  mk: 'm',
  step: 2,
  farm: '',
  units: '°C',
  toast: '',
  v: { x: 0, y: 0, k: 1 },
  ly: 'water',
  off: readJson<AppState['off']>(OFFSETS_KEY, {}),
  name: '',
  role: 'Owner',
  wm: null,
  hud: '',
  fd: null,
  edit: false,
  moved: false,
  log: readJson<WaterLogEntry[] | null>(LOG_KEY, null) ?? [],
  cropByName: {},
  liveWeather: null,
  liveAdvice: {},
  liveAlerts: [],
  liveSensors: {},
  liveMoistureSeries: {},
  liveHistory: {},
};

export const saveOffsets = () => writeJson(OFFSETS_KEY, S.off);
export const saveLog = () => writeJson(LOG_KEY, S.log);
export const saveCards = () => writeJson(CARDS_KEY, { min: S.min, bare: S.bare, d3: S.d3 });
