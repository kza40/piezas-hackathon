import { farmerByEmail, farmerById, type Farmer } from './seed/farmers';
import { clearFarmScope, scopeToFields } from './seed/simulate';
import { S } from './state';

const SESSION_KEY = 'fw-session';

function applyFarmer(farmer: Farmer) {
  S.farmerId = farmer.id;
  S.name = farmer.name;
  S.role = farmer.role;
  S.farm = farmer.farm;
  S.authError = '';
  S.authEmail = '';
  S.page = 'map';
  S.panel = null;
  S.wm = null;
  S.edit = false;
  S.sel = farmer.fields[0];
  S.fd = farmer.fields[0];
  scopeToFields(farmer.fields);
}

/** Restore a saved farmer, or leave the app on the login screen. */
export function restoreSession(): boolean {
  let id: string | null = null;
  try {
    id = localStorage.getItem(SESSION_KEY);
  } catch {
    id = null;
  }
  const farmer = farmerById(id);
  if (!farmer) {
    S.farmerId = null;
    S.page = 'login';
    clearFarmScope();
    return false;
  }
  applyFarmer(farmer);
  return true;
}

export function currentFarmer(): Farmer | null {
  return farmerById(S.farmerId);
}

export function signIn(email: string, password: string): boolean {
  S.authEmail = email.trim();
  const farmer = farmerByEmail(email);
  if (!farmer || farmer.password !== password) {
    S.authError = 'Wrong email or password.';
    return false;
  }
  try {
    localStorage.setItem(SESSION_KEY, farmer.id);
  } catch {
    // session won't survive a reload
  }
  applyFarmer(farmer);
  return true;
}

export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  S.farmerId = null;
  S.authError = '';
  S.page = 'login';
  S.panel = null;
  S.wm = null;
  S.edit = false;
  clearFarmScope();
}
