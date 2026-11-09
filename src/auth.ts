import { ApiError, authApi, farmApi, type ApiUser, type ApiProfile } from './api';
import { clearFarmScope, F, hydrateFields } from './seed/simulate';
import { S } from './state';
import { loadLiveData } from './live';
import type { Crop } from './types';

function applyProfile(user: ApiUser, profile: ApiProfile) {
  S.farmerId = user.id;
  S.email = user.email;
  S.name = profile.name || user.email.split('@')[0] || 'Farmer';
  S.phone = profile.phone || '';
  S.authError = '';
  S.authEmail = '';
  S.page = 'map';
  S.panel = null;
  S.wm = null;
  S.edit = false;
}

async function loadFarmData() {
  const [{ cropProfiles }, { farms }] = await Promise.all([farmApi.crops(), farmApi.list()]);
  S.cropByName = {};
  for (const c of cropProfiles) {
    if ((['Wheat', 'Canola', 'Barley', 'Oats', 'Alfalfa', 'Blueberries'] as string[]).includes(c.name)) {
      S.cropByName[c.name as Crop] = c.id;
    }
  }
  const farm = farms[0] ?? null;
  S.farmId = farm?.id ?? null;
  S.farm = farm?.name ?? '';
  S.farmLat = farm?.latitude ?? null;
  S.farmLng = farm?.longitude ?? null;
  if (!farm) {
    clearFarmScope();
    S.sel = '';
    S.fd = null;
    return;
  }
  const { fields } = await farmApi.fields(farm.id);
  hydrateFields(fields);
  S.sel = fields[0]?.id ?? '';
  S.fd = fields[0]?.id ?? null;
  await loadLiveData();
}

function authFail(e: unknown, fallback: string) {
  S.authError = e instanceof ApiError ? e.message : fallback;
  S.farmerId = null;
  S.page = 'login';
  clearFarmScope();
  return false;
}

/** Restore session from the httpOnly cookie via GET /api/auth/me. */
export async function restoreSession(): Promise<boolean> {
  try {
    const { user, profile } = await authApi.me();
    applyProfile(user, profile);
    await loadFarmData();
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      S.farmerId = null;
      S.page = 'login';
      clearFarmScope();
      return false;
    }
    S.farmerId = null;
    S.page = 'login';
    S.authError = e instanceof ApiError ? e.message : 'Could not reach the farm server. Is the API running on port 8787?';
    clearFarmScope();
    return false;
  }
}

export async function signIn(email: string, password: string): Promise<boolean> {
  S.authEmail = email.trim();
  S.authError = '';
  try {
    const { user, profile } = await authApi.signIn(email.trim(), password);
    applyProfile(user, profile);
    await loadFarmData();
    return true;
  } catch (e) {
    return authFail(e, 'Email or password is incorrect.');
  }
}

export async function signUp(email: string, password: string, name?: string): Promise<boolean> {
  S.authEmail = email.trim();
  S.authError = '';
  try {
    const { user, profile } = await authApi.signUp(email.trim(), password, name?.trim() || undefined);
    applyProfile(user, profile);
    await loadFarmData();
    return true;
  } catch (e) {
    return authFail(e, 'Could not create the account.');
  }
}

export async function signOut() {
  try {
    await authApi.signOut();
  } catch {
    // cookie may already be gone
  }
  S.farmerId = null;
  S.email = '';
  S.phone = '';
  S.farmId = null;
  S.farm = '';
  S.farmLat = null;
  S.farmLng = null;
  S.name = '';
  S.authError = '';
  S.authMode = 'signin';
  S.page = 'login';
  S.panel = null;
  S.wm = null;
  S.edit = false;
  S.sel = '';
  S.fd = null;
  S.cropByName = {};
  S.liveWeather = null;
  S.liveAdvice = {};
  S.liveAlerts = [];
  clearFarmScope();
}

/** Reload fields for the active farm after an add/remove. */
export async function refreshFields() {
  if (!S.farmId) {
    clearFarmScope();
    return;
  }
  const { fields } = await farmApi.fields(S.farmId);
  hydrateFields(fields);
  if (!F.some((f) => f.id === S.sel)) S.sel = fields[0]?.id ?? '';
  if (S.fd && !F.some((f) => f.id === S.fd)) S.fd = fields[0]?.id ?? null;
  await loadLiveData();
}
