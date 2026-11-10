/** Relative `/api` calls (Vite proxies to localhost:8787 in dev). Cookie session. */
import type { AdviceResponse, EventLabel } from './types';

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.error || 'Request failed');
    this.status = status;
    this.code = body.error;
  }
}

export interface ApiUser {
  id: string;
  email: string;
}

export interface ApiProfile {
  name: string;
  phone: string;
}

export interface ApiCropProfile {
  id: string;
  key: string;
  name: string;
  moistureMin: number | null;
  moistureMax: number | null;
  phMin: number | null;
  phMax: number | null;
  ecMax: number | null;
  frostRiskC: number | null;
}

export interface ApiFarm {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface ApiField {
  id: string;
  farmId: string;
  name: string;
  cropProfile: ApiCropProfile | null;
  acres: number | null;
  stage: string;
  soil: string;
  createdAt: string;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = { error: 'server_error', message: res.statusText || 'Request failed' };
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // keep fallback
  }
  return new ApiError(res.status, body);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body != null && init.body !== '';
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw await parseError(res);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const authApi = {
  /** The signed-in farmer, or user null when signed out (not a 401). */
  me: () => api<{ user: ApiUser | null; profile: ApiProfile | null }>('/api/auth/me'),
  signIn: (email: string, password: string) =>
    api<{ user: ApiUser; profile: ApiProfile }>('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signUp: (email: string, password: string, name?: string) =>
    api<{ user: ApiUser; profile: ApiProfile }>('/api/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(name ? { email, password, name } : { email, password }),
    }),
  signOut: () => api<void>('/api/auth/sign-out', { method: 'POST' }),
};

export const profileApi = {
  update: (patch: { name?: string; phone?: string }) =>
    api<{ profile: ApiProfile }>('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};

export const farmApi = {
  crops: () => api<{ cropProfiles: ApiCropProfile[] }>('/api/crop-profiles'),
  list: () => api<{ farms: ApiFarm[] }>('/api/farms'),
  create: (body: { name: string; latitude: number; longitude: number }) =>
    api<{ farm: ApiFarm }>('/api/farms', { method: 'POST', body: JSON.stringify(body) }),
  fields: (farmId: string) => api<{ fields: ApiField[] }>(`/api/farms/${farmId}/fields`),
  addField: (
    farmId: string,
    body: { name: string; cropProfileId: string; acres?: number; stage?: string; soil?: string },
  ) => api<{ field: ApiField }>(`/api/farms/${farmId}/fields`, { method: 'POST', body: JSON.stringify(body) }),
  deleteField: (fieldId: string) => api<void>(`/api/fields/${fieldId}`, { method: 'DELETE' }),
  getWeather: (farmId: string) =>
    api<{ simulated?: boolean; rainNext48hMm: number; overnightLowC: number; hours: { time: string; tempC: number; rainMm: number }[] }>(
      `/api/farms/${farmId}/weather`,
    ),
  getAdvice: (fieldId: string) => api<AdviceResponse>(`/api/fields/${fieldId}/advice`),
  // R-009/R-021: the field's watering setup. trigger: null clears it.
  updateField: (
    fieldId: string,
    body: { irrigated?: boolean; soil?: string; trigger?: { value: number; source?: 'suggested' | 'manual'; basis?: string } | null },
  ) => api<{ field: ApiField }>(`/api/fields/${fieldId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // R-023: the farmer's label for a detected wetting event; null removes it.
  eventFeedback: (fieldId: string, start: string, label: EventLabel | null) =>
    api<{ field: ApiField }>(`/api/fields/${fieldId}/events/${encodeURIComponent(start)}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  listAlerts: (status?: 'open' | 'done') =>
    api<{ alerts: { id: string; fieldId: string; message: string; status: string; createdAt: string; doneAt: string | null }[] }>(
      status ? `/api/alerts?status=${status}` : '/api/alerts',
    ),
  markAlertDone: (alertId: string) =>
    api<{ alert: { id: string; status: string } }>(`/api/alerts/${alertId}/done`, { method: 'POST' }),
  listSensors: (fieldId: string) =>
    api<{ sensors: { id: string; name: string; keyStatus: string; latest: Record<string, { value: number; unit: string; time: string }>; createdAt: string }[] }>(
      `/api/fields/${fieldId}/sensors`,
    ),
  getReadings: (fieldId: string, days = 7) =>
    api<{ days: number; sensors: { sensorId: string; simulated: boolean; series: Record<string, { time: string; value: number }[]> }[] }>(
      `/api/fields/${fieldId}/readings?days=${days}`,
    ),
  exportCsv: async (fieldId: string) => {
    const res = await fetch(`/api/fields/${fieldId}/export`, { credentials: 'same-origin' });
    if (!res.ok) {
      if (res.status === 401) onUnauthorized?.();
      throw await parseError(res);
    }
    const blob = await res.blob();
    const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
    const filename = match?.[1] ?? 'field-export.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking at once can cancel the download
  },
};


