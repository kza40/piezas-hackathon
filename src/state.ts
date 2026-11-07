import type { AppState, WaterLogEntry } from './types';

const OFFSETS_KEY = 'fw-off';
const LOG_KEY = 'fw-log';

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
  page: 'map',
  sel: 'A',
  done: {},
  dis: {},
  flt: 'all',
  mk: 'm',
  step: 2,
  farm: 'Willow Creek Farm',
  units: '°C',
  toast: '',
  v: { x: 0, y: 0, k: 1 },
  ly: 'water',
  off: readJson<AppState['off']>(OFFSETS_KEY, {}),
  name: 'Sam Whitfield',
  role: 'Owner',
  wm: null,
  fd: null,
  edit: false,
  moved: false,
  log: readJson<WaterLogEntry[] | null>(LOG_KEY, null) ?? [{ f: 'D', d: 'Yesterday, 6:10 pm', mm: 8 }],
};

export const saveOffsets = () => writeJson(OFFSETS_KEY, S.off);
export const saveLog = () => writeJson(LOG_KEY, S.log);
