// The /api routes. Thin on purpose: parse the request, find the farmer, call lib/server, return JSON.
// See docs/api.md for the contract with the frontend.
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, getSessionUser, signIn, signOut, signUp, type SessionUser } from '../lib/server/auth';
import { AppError, badRequest, notFound, toHttp, unauthorized } from '../lib/server/errors';
import { listCropProfiles } from '../lib/server/data/crops';
import { createFarm, createField, deleteField, getFarm, getField, listFarms, listFields, setEventFeedback, updateFieldSettings } from '../lib/server/data/farms';
import { getProfile, parseProfileInput, updateProfile } from '../lib/server/data/profile';
import { createSensor, fieldReadings, ingest, listSensors, revokeSensor, simulateField } from '../lib/server/data/sensors';
import { listAlerts, markAlertDone } from '../lib/server/data/alerts';
import { fieldAdvice, plantingAdvice, farmWeather } from '../lib/server/data/advice';
import { object } from '../lib/server/validate';

type Env = { Variables: { user: SessionUser } };

// Secure whenever the farmer reached us over https, directly or through the host's proxy.
const isHttps = (c: Context) => new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';

function setSession(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c),
    path: '/',
    maxAge: SESSION_TTL_SECONDS, // the server still checks the session on every request
  });
}

// Request bodies must be sent as application/json. That is what stops cross-site forgery of
// sign-in and other writes: another site can only send JSON with that header after a CORS preflight,
// which this API never allows. (text/plain bodies would otherwise parse as JSON just fine.)
async function body(c: Context): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) {
    throw new AppError(415, 'unsupported_media_type', 'Send the request body as JSON (Content-Type: application/json).');
  }
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
// session, and bodies must be application/json (see body()), so no other site can sign anyone in.
api.onError((e, c) => {
  if (e instanceof HTTPException) return e.getResponse();
  const { status, body } = toHttp(e);
  return c.json(body, status as 400);
});

// Accounts
api.post('/auth/sign-up', async (c) => {
  const b = await body(c);
  // Check the name before the account exists, so a bad name never leaves a half-made sign-up.
  const profile = b.name === undefined || b.name === '' ? {} : parseProfileInput({ name: b.name });
  const s = await signUp(b.email, b.password);
  setSession(c, s.token);
  if (profile.name) await updateProfile(s.user.id, profile);
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
// Field settings: irrigated, stage, soil, and the soil-moisture trigger (R-009, R-021, R-024).
api.patch('/fields/:fieldId', signedIn, async (c) => c.json({ field: await updateFieldSettings(c.var.user.id, c.req.param('fieldId'), await body(c)) }));
// The farmer confirms or corrects a detected wetting event (R-023); :start is the event's start time.
api.post('/fields/:fieldId/events/:start/feedback', signedIn, async (c) =>
  c.json({ field: await setEventFeedback(c.var.user.id, c.req.param('fieldId'), c.req.param('start'), await body(c)) }),
);
api.delete('/fields/:fieldId', signedIn, async (c) => {
  await deleteField(c.var.user.id, c.req.param('fieldId'));
  return c.body(null, 204);
});

// Sensors and device keys
api.get('/fields/:fieldId/sensors', signedIn, async (c) => c.json({ sensors: await listSensors(c.var.user.id, c.req.param('fieldId')) }));
api.post('/fields/:fieldId/sensors', signedIn, async (c) => c.json(await createSensor(c.var.user.id, c.req.param('fieldId'), await body(c)), 201));
api.get('/fields/:fieldId/readings', signedIn, async (c) => c.json(await fieldReadings(c.var.user.id, c.req.param('fieldId'), c.req.query('days'))));
api.post('/fields/:fieldId/simulate', signedIn, async (c) => c.json({ sensors: await simulateField(c.var.user.id, c.req.param('fieldId')) }));
api.post('/sensors/:sensorId/revoke', signedIn, async (c) => c.json({ sensor: await revokeSensor(c.var.user.id, c.req.param('sensorId')) }));

// Alerts (created by the advice rule through openAlert; the farmer lists them and marks them done)
api.get('/alerts', signedIn, async (c) => c.json({ alerts: await listAlerts(c.var.user.id, c.req.query('status')) }));
api.post('/alerts/:alertId/done', signedIn, async (c) => c.json({ alert: await markAlertDone(c.var.user.id, c.req.param('alertId')) }));
api.get('/farms/:farmId/weather', signedIn, async (c) =>
  c.json(await farmWeather(c.var.user.id, c.req.param('farmId'))),
);
api.get('/fields/:fieldId/advice', signedIn, async (c) =>
  c.json(await fieldAdvice(c.var.user.id, c.req.param('fieldId'))),
);
api.get('/fields/:fieldId/planting', signedIn, async (c) =>
  c.json(await plantingAdvice(c.var.user.id, c.req.param('fieldId'))),
);
// Devices send readings here. No farmer session: the x-device-key header is the credential.
// Public, so the body is capped before it is read: 50 readings fit in a few KB.
const ingestLimit = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) => c.json({ error: 'payload_too_large', message: 'Send at most 50 readings at a time.' }, 413),
});
api.post('/ingest', ingestLimit, async (c) => c.json(await ingest(c.req.header('x-device-key'), await body(c)), 202));

// Anything else under /api is a JSON 404, never the frontend's index.html.
api.all('/*', () => {
  throw notFound('Page');
});
