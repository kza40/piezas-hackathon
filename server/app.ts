// The /api routes. Thin on purpose: parse the request, find the farmer, call lib/server, return JSON.
// See docs/api.md for the contract with the frontend.
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, getSessionUser, signIn, signOut, signUp, type SessionUser } from '../lib/server/auth';
import { badRequest, notFound, toHttp, unauthorized } from '../lib/server/errors';
import { listCropProfiles } from '../lib/server/data/crops';
import { createFarm, createField, deleteField, getFarm, getField, listFarms, listFields } from '../lib/server/data/farms';
import { getProfile, updateProfile } from '../lib/server/data/profile';
import { object } from '../lib/server/validate';

type Env = { Variables: { user: SessionUser } };

function setSession(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS, // the server still checks the session on every request
  });
}

async function body(c: Context): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    throw badRequest('Expected a JSON object.');
  }
  return object(parsed);
}

// Signed-in farmer, or 401. Swaps in a rotated token when Piezas issues one.
const signedIn = createMiddleware<Env>(async (c, next) => {
  const s = await getSessionUser(getCookie(c, SESSION_COOKIE));
  if (!s) throw unauthorized();
  if (s.refreshedToken) setSession(c, s.refreshedToken);
  c.set('user', s.user);
  await next();
});

export const api = new Hono<Env>().basePath('/api');

// Cross-site request forgery: the cookie is SameSite=Lax, so other sites' POST/PATCH/DELETE carry no
// session, and every body must be JSON, so a cross-site HTML form cannot even sign someone in.
api.onError((e, c) => {
  if (e instanceof HTTPException) return e.getResponse();
  const { status, body } = toHttp(e);
  return c.json(body, status as 400);
});

// Accounts
api.post('/auth/sign-up', async (c) => {
  const b = await body(c);
  const s = await signUp(b.email, b.password);
  setSession(c, s.token);
  if (typeof b.name === 'string' && b.name.trim()) await updateProfile(s.user.id, { name: b.name });
  return c.json({ user: s.user, profile: await getProfile(s.user.id) }, 201);
});

api.post('/auth/sign-in', async (c) => {
  const b = await body(c);
  const s = await signIn(b.email, b.password);
  setSession(c, s.token);
  return c.json({ user: s.user, profile: await getProfile(s.user.id) });
});

api.post('/auth/sign-out', async (c) => {
  await signOut(getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

api.get('/auth/me', signedIn, async (c) => c.json({ user: c.var.user, profile: await getProfile(c.var.user.id) }));

api.patch('/me/profile', signedIn, async (c) => c.json({ profile: await updateProfile(c.var.user.id, await body(c)) }));

// Crops, farms, fields
api.get('/crop-profiles', signedIn, async (c) => c.json({ cropProfiles: await listCropProfiles() }));

api.get('/farms', signedIn, async (c) => c.json({ farms: await listFarms(c.var.user.id) }));
api.post('/farms', signedIn, async (c) => c.json({ farm: await createFarm(c.var.user.id, await body(c)) }, 201));
api.get('/farms/:farmId', signedIn, async (c) => c.json({ farm: await getFarm(c.var.user.id, c.req.param('farmId')) }));

api.get('/farms/:farmId/fields', signedIn, async (c) => c.json({ fields: await listFields(c.var.user.id, c.req.param('farmId')) }));
api.post('/farms/:farmId/fields', signedIn, async (c) =>
  c.json({ field: await createField(c.var.user.id, c.req.param('farmId'), await body(c)) }, 201),
);

api.get('/fields/:fieldId', signedIn, async (c) => c.json({ field: await getField(c.var.user.id, c.req.param('fieldId')) }));
api.delete('/fields/:fieldId', signedIn, async (c) => {
  await deleteField(c.var.user.id, c.req.param('fieldId'));
  return c.body(null, 204);
});

// Anything else under /api is a JSON 404, never the frontend's index.html.
api.all('/*', () => {
  throw notFound('Page');
});
