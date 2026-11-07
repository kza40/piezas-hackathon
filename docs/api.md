# Backend API (accounts, profile, farms, fields)

The contract between the Vite frontend and the backend on `backend/platform`. Every request with a body must send it as JSON with the header `Content-Type: application/json` (otherwise 415); this is what protects sign-in and other writes from cross-site forgery. Errors always look like:

```json
{ "error": "invalid_input", "message": "Latitude must be between -90 and 90." }
```

`message` is written for the farmer and can be shown as-is. `error` is one of `invalid_input` (400), `unauthorized` (401), `account_pending` / `mfa_required` (403), `not_found` (404), `conflict` (409), `unsupported_media_type` (415), `server_error` (500), `unavailable` (503: Piezas is busy or unreachable, worth one retry).

## Running it

- `npm run dev:api` starts the API on http://localhost:8787 against the TEST Piezas app (needs `.env`, see below).
- The Vite dev server must forward `/api` to it. Add this `vite.config.ts` on the frontend branch (frontend's call):

  ```ts
  import { defineConfig } from 'vite';
  export default defineConfig({ server: { proxy: { '/api': 'http://localhost:8787' } } });
  ```

- Production: `npm run build` (the frontend's Vite build into `dist/`; that script comes with the frontend branch), then `npm start`. The same server serves `dist/` and `/api`, so the frontend always calls relative paths like `/api/farms`.
- `.env` comes from `npx piezas init` on a machine logged in to the Piezas account; it is never committed.

## Session

The session is an httpOnly, SameSite=Lax cookie named `piezas_session` (lasts 7 days, `Secure` whenever the site is served over https), set and cleared by the backend. The frontend never reads or stores a token and does not need localStorage for the session: `fetch` on the same origin sends the cookie by default. On load, call `GET /api/auth/me`: 200 means signed in, 401 means show the sign-in screen.

## Accounts and profile

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/auth/sign-up` | `{ email, password, name? }` (password at least **10** characters, name up to 80; a bad name is rejected before the account is made) | 201 `{ user: { id, email }, profile }` and sets the cookie. Same email with a different password: 409 "An account with this email already exists. Sign in instead." Same email and password: signs in. |
| `POST /api/auth/sign-in` | `{ email, password }` | `{ user, profile }` and sets the cookie. Wrong email or password: 401 "Email or password is incorrect." After 10 wrong tries in 15 minutes Piezas locks the account for a while (same 401). |
| `POST /api/auth/sign-out` | none | 204 and clears the cookie |
| `GET /api/auth/me` | none | `{ user, profile }`, or 401 when signed out |
| `PATCH /api/me/profile` | `{ name?, phone? }` (only the keys sent change; `phone: ""` clears it; a phone needs at least 7 digits) | `{ profile: { name, phone } }` |

## Crops, farms, fields (all need a signed-in farmer)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/crop-profiles` | none | `{ cropProfiles: [{ id, key, name, moistureMin, moistureMax, phMin, phMax, ecMax, frostRiskC }] }`, in the order Wheat, Canola, Barley, Oats, Alfalfa, Blueberries. `name` matches the frontend's `Crop` labels; `ecMax` may be `null`. |
| `GET /api/farms` | none | `{ farms: [{ id, name, latitude, longitude, createdAt }] }` (empty for a new farmer) |
| `POST /api/farms` | `{ name, latitude, longitude }` | 201 `{ farm }` |
| `GET /api/farms/:farmId` | none | `{ farm }` |
| `GET /api/farms/:farmId/fields` | none | `{ fields: [field] }` |
| `POST /api/farms/:farmId/fields` | `{ name, cropProfileId, acres?, stage?, soil? }` | 201 `{ field }` |
| `GET /api/fields/:fieldId` | none | `{ field }` |
| `DELETE /api/fields/:fieldId` | none | 204 |

A `field` is `{ id, farmId, name, cropProfile, acres, stage, soil, createdAt }`, with the full `cropProfile` object (so the ideal moisture and pH ranges are right there) and `stage` / `soil` as `""` when not set. Sensors, readings, advice and alerts come in later steps.

Another farmer's farm or field always answers 404, exactly like one that does not exist.

## Demo accounts (test app)

`scripts/seed-demo.ts` has created the two demo farmers from `src/seed/farmers.ts` with their farms and fields:

| Email | Password | Farm | Fields |
|---|---|---|---|
| sam@willowcreekfarm.ca | `farm123-demo` | Willow Creek Farm | North Wheat, East Canola, South Barley |
| jordan@mapleridge.ca | `oats456-demo` | Maple Ridge Farm | West Oats, Creek Alfalfa, Blueberry Hill |

## Changes the frontend needs to work with this (frontend's decision and code)

1. Replace the mock sign-in and localStorage session (`src/auth.ts`) with `/api/auth/*` and `GET /api/auth/me` on load.
2. Demo passwords: Piezas requires at least 10 characters, so `farm123` / `oats456` become `farm123-demo` / `oats456-demo`. Passwords should not stay in the bundle; the demo buttons can keep them only as a convenience for the demo.
3. No sign-up screen exists yet; R-001 / S-001 need one (email, password, optional name).
4. Farm location: the backend needs latitude and longitude (for weather). `location: 'Wellington County, ON'` is display text only; a new farm needs coordinates (a map pin or two number inputs).
5. Ids: farms and fields have server ids (UUIDs), not letters `A` to `F`. Map positions keyed by field id (`fw-off`) need to use these.
6. Add field: send `cropProfileId` (from `/api/crop-profiles`), `acres`, `stage`, `soil`; remove field: `DELETE /api/fields/:id`.
7. Profile: name and phone are stored (`PATCH /api/me/profile`). Role, "farmer since" and alert preferences have no backend yet; say if they should.
8. Scenario tests: rename the frontend's `S-001` to `S-005` files to the new numbers in SPEC.md: S-001 sign-in becomes **S-019**, S-002 wrong password **S-020**, S-003 own fields only **S-011**, S-004 sign-out **S-021**, S-005 add/remove field **S-022**.
