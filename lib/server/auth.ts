// Farmer sign-up, sign-in and sessions, on Piezas's user service.
// Piezas returns the session token in the response body; routes put it in an httpOnly cookie.
import { DEFAULT_SESSION_COOKIE } from '@piezas/sdk';
import { piezas, errorCode } from './piezas';
import { AppError, conflict, unauthorized } from './errors';
import { email as checkEmail, password as checkPassword } from './validate';

// Same name the SDK's "Report a problem" widget looks for, so reports are tied to the farmer.
export const SESSION_COOKIE = DEFAULT_SESSION_COOKIE;

export interface SessionUser {
  id: string;
  email: string;
}
export interface Session {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

const EXISTS = 'An account with this email already exists. Sign in instead.';

const userOf = (u: { id: string; email: string }): SessionUser => ({ id: u.id, email: u.email });

export async function signUp(emailIn: unknown, passwordIn: unknown): Promise<Session> {
  const email = checkEmail(emailIn);
  const password = checkPassword(passwordIn);
  try {
    await piezas().users.signUp({ email, password });
  } catch (e) {
    if (errorCode(e) === 'conflict') throw conflict(EXISTS);
    throw e;
  }
  // Sign-up returns no session (docs/backend-notes.md, E15), so sign in straight away.
  // Piezas hides whether an email is taken: a repeat sign-up "succeeds" without creating an account.
  // Same password: this signs the farmer into their existing account. Different password: say so.
  try {
    return await signIn(email, password);
  } catch (e) {
    if (e instanceof AppError && e.status === 401) throw conflict(EXISTS);
    throw e;
  }
}

export async function signIn(emailIn: unknown, passwordIn: unknown): Promise<Session> {
  const email = checkEmail(emailIn);
  const password = typeof passwordIn === 'string' ? passwordIn : '';
  let r;
  try {
    r = await piezas().users.signIn({ email, password });
  } catch (e) {
    const code = errorCode(e);
    // One message for wrong email, wrong password and locked accounts, like the service itself.
    if (code === 'invalid_credentials' || code === 'account_locked') throw unauthorized('Email or password is incorrect.');
    if (code === 'account_pending') throw new AppError(403, 'account_pending', 'Please confirm your email first.');
    throw e;
  }
  if (r.mfa) throw new AppError(403, 'mfa_required', 'This account needs a second sign-in step, which the app does not support yet.');
  if (!r.session || !r.user) throw unauthorized('Email or password is incorrect.');
  return { token: r.session.token, expiresAt: r.session.expiresAt, user: userOf(r.user) };
}

// The signed-in farmer for a token, or null. When Piezas rotates the token, refreshedToken is set
// and the route must replace the cookie with it.
export async function getSessionUser(token: string | undefined): Promise<{ user: SessionUser; refreshedToken?: string } | null> {
  if (!token) return null;
  try {
    const r = await piezas().users.getSession(token);
    if (!r.valid || !r.user) return null;
    return { user: userOf(r.user), refreshedToken: r.refreshedToken };
  } catch (e) {
    if (['invalid_session', 'unauthorized', 'not_found'].includes(errorCode(e) ?? '')) return null;
    throw e;
  }
}

export async function requireUser(token: string | undefined): Promise<SessionUser> {
  const s = await getSessionUser(token);
  if (!s) throw unauthorized();
  return s.user;
}

export async function signOut(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    await piezas().users.signOut(token);
  } catch (e) {
    if (!['invalid_session', 'unauthorized', 'not_found'].includes(errorCode(e) ?? '')) throw e;
  }
}
