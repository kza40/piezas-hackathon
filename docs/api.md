# Backend API (accounts, profile, farms, fields, sensors, ingest)

The contract between the Vite frontend (and sensor devices) and the backend. Every request with a body must send it as JSON with the header `Content-Type: application/json` (otherwise 415); this is what protects sign-in and other writes from cross-site forgery. Errors always look like:

```json
{ "error": "invalid_input", "message": "Latitude must be between -90 and 90." }
```

`message` is written for the farmer and can be shown as-is. `error` is one of `invalid_input` (400), `unauthorized` (401), `account_pending` / `mfa_required` (403), `not_found` (404), `conflict` (409), `unsupported_media_type` (415), `payload_too_large` (413, ingest only), `rate_limited` (429, ingest only), `server_error` (500), `unavailable` (503: Piezas is busy or unreachable, worth one retry).

## Running it

- `npm run dev:api` starts the API on http://localhost:8787 against the TEST Piezas app (needs `.env`, see below).
- The Vite dev server must forward `/api` to it. Add this `vite.config.ts` on the frontend branch (frontend's call):

  ```ts
  import { defineConfig } from 'vite';
  export default defineConfig({ server: { proxy: { '/api': 'http://localhost:8787' } } });
  ```

- Production: `npm run build` (the frontend's Vite build into `dist/`; that script comes with the frontend branch), then `npm start`. The same server serves `dist/` and `/api`, so the frontend always calls relative paths like `/api/farms`.
- `.env` holds your own Piezas keys (`PIEZAS_API_KEY`, `PIEZAS_TEST_API_KEY`, `PIEZAS_API_URL`); it is never committed.
- `.env` also needs `DEVICE_KEY_PEPPER` (at least 32 random characters), used to hash device keys. Device keys only work on a server with the same pepper that made them, so everyone running against the shared test app should use the same test pepper (ask whoever set up the test app; share it privately, never in the repo), and the live app gets its own, set once in the hosting settings and never changed.

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
| `GET /api/crop-profiles` | none | `{ cropProfiles: [{ id, key, name, moistureMin, moistureMax, phMin, phMax, ecMax, frostRiskC }] }`, in the order Wheat, Canola, Barley, Oats, Alfalfa, Blueberries. `name` matches the frontend's `Crop` labels; any unsupported threshold is `null`. See `docs/crop-guidance.md` for published values and their limits. |
| `GET /api/farms` | none | `{ farms: [{ id, name, latitude, longitude, createdAt }] }` (empty for a new farmer) |
| `POST /api/farms` | `{ name, latitude, longitude }` | 201 `{ farm }` |
| `GET /api/farms/:farmId` | none | `{ farm }` |
| `GET /api/farms/:farmId/fields` | none | `{ fields: [field] }` |
| `POST /api/farms/:farmId/fields` | `{ name, cropProfileId, acres?, stage?, soil? }` | 201 `{ field }` |
| `GET /api/fields/:fieldId` | none | `{ field }` |
| `PATCH /api/fields/:fieldId` | any of `{ irrigated, stage, soil, trigger }` | `{ field }` |
| `POST /api/fields/:fieldId/events/:start/feedback` | `{ label: "irrigation" \| "rain" \| "none" \| null }` | `{ field }` |
| `DELETE /api/fields/:fieldId` | none | 204 |

A `field` is `{ id, farmId, name, cropProfile, acres, stage, soil, irrigated, trigger, eventFeedback, createdAt }`, with the full `cropProfile` object and `stage` / `soil` as `""` when not set. Removing a field also removes its sensors. Weather and advice endpoints are documented below.

Field settings (R-009, R-021, R-024):

- `irrigated` is `false` for a new field (rain-fed: no watering advice). Send `true` for a field the farmer can water.
- Changing `irrigated` or `trigger` closes the field's open watering alert (`closedBy: "settings"`) without the 12-hour quiet period, so the next advice raises it again only if it still applies.
- `trigger` is `null` until the farmer saves one: `{ value, source: "suggested" | "manual", basis, savedAt }`. Save with `{ trigger: { value, source?, basis? } }` (value 1 to 80 %); to save the app's suggestion, send its `value` and `basis` with `source: "suggested"`. `{ trigger: null }` clears it.
- `soil` is free text, but the trigger suggestion needs one of the FAO-56 textures in it: sand, loamy sand, sandy loam, loam, silt loam, silt, silty clay loam, silty clay, clay.
- `eventFeedback` maps a detected event's `start` to the farmer's label. `:start` in the feedback URL is that event's `start` (URL-encoded); `label: null` removes the farmer's label.

Another farmer's farm, field or sensor always answers 404, exactly like one that does not exist.

## Sensors (signed-in farmer)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/fields/:fieldId/sensors` | none | `{ sensors: [sensor] }`, oldest first |
| `POST /api/fields/:fieldId/sensors` | `{ name }` (up to 60 characters) | 201 `{ sensor, deviceKey }`. **`deviceKey` is shown this once** (only a hash is stored): show it with a copy button and say it will not be shown again. |
| `POST /api/sensors/:sensorId/revoke` | none | `{ sensor }` with `keyStatus: "revoked"`; that device's readings are refused from now on |

A `sensor` is `{ id, fieldId, name, keyStatus, latest, createdAt }`. `keyStatus` is `"active"` or `"revoked"`. `latest` has the newest reading of each type the sensor has sent, so a sensor shows whatever it measures:

```json
{ "soil_moisture": { "value": 31.2, "unit": "%", "time": "2026-11-07T17:00:00.000Z" },
  "soil_ph": { "value": 5.1, "unit": "pH", "time": "2026-11-07T17:00:00.000Z" } }
```

It is `{}` until the first reading arrives.

## Reading history and the simulator (signed-in farmer)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/fields/:fieldId/readings?days=7` | none | `{ days, sensors: [{ sensorId, simulated, series }] }` for the last `days` days (whole number 1 to 14, default 7) |
| `POST /api/fields/:fieldId/simulate` | none | `{ sensors: [sensor] }`. Fills every sensor on the field with 14 days of hourly simulated readings of all six types, ending now, and sets their `latest`. **Replaces** those sensors' stored history (a demo tool). 400 if the field has no sensors. |

`series` has one list per reading type, oldest first, for drawing the 7-day trends:

```json
{ "soil_moisture": [ { "time": "2026-11-01T18:00:00.000Z", "value": 41.2 }, ... ], "soil_ph": [ ... ] }
```

`simulated` is `true` when any point shown came from the simulator, so the page can say the data is simulated. History is kept for 14 days; a reading older than that is accepted by ingest but not stored.

## Ingest (devices, no farmer session)

`POST /api/ingest` with headers `Content-Type: application/json` and `x-device-key: fwk_...`. The body is one reading, or a batch of up to 50:

```json
{ "type": "soil_moisture", "value": 27.4, "unit": "%", "time": "2026-11-07T17:00:00Z" }
{ "readings": [ { "type": "soil_moisture", ... }, { "type": "soil_ph", ... } ] }
```

| type | unit | accepted values |
|---|---|---|
| `soil_moisture` | `%` | 0 to 100 |
| `soil_temperature` | `C` | -40 to 80 |
| `soil_ec` | `dS/m` | 0 to 20 |
| `soil_ph` | `pH` | 0 to 14 |
| `air_temperature` | `C` | -60 to 60 |
| `air_humidity` | `%` | 0 to 100 |

`time` is ISO 8601 with a time zone (`Z` or `-08:00`), at most 10 minutes in the future. Replies: 202 `{ accepted: n }`; 400 when any reading is invalid (nothing in that batch is saved; the message says which reading, e.g. "Reading 2: soil_temperature must be sent in C."); 401 for a missing, wrong or revoked key; 429 above 120 requests a minute from one key. A reading older than the one already shown for that type is accepted but does not replace it.

## Alerts (signed-in farmer)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/alerts?status=open` | none | `{ alerts: [alert] }`, newest first. `status` is `open`, `done`, or left out for all. |
| `POST /api/alerts/:alertId/done` | none | `{ alert }` with `status: "done"`; marking it again keeps the first `doneAt` |

An `alert` is `{ id, fieldId, message, status, createdAt, doneAt }` (`doneAt` is `null` while open). Removing a field removes its alerts.

Farmers do not create alerts; the advice rule does, on the server, with `openAlert(ownerId, fieldId, message)` from `lib/server/data/alerts.ts`:

- It returns the field's open alert if there is one (never a second one, even for parallel page views; S-018), otherwise creates it.
- It returns `null` for 12 hours after the farmer marks that field's alert done, so "done" is not undone by the next page view. After that it can open again.
- The message is fixed when the alert opens; the field page shows the live reason.

## Weather and advice (signed-in farmer)
| Method and path | Returns |
|---|---|
| `GET /api/farms/:farmId/weather` | `{ rainNext48hMm, overnightLowC, hours }` |
| `GET /api/fields/:fieldId/advice` | see below — may create one open watering alert when status is Water today |
| `GET /api/fields/:fieldId/planting` | `{ weeks: [{ week, reason, score }] }` recommendation only; no planting date is stored |

The farm must have latitude and longitude or these return 400. `soilWarning` and `frostWarning` are strings or `null`.

`GET /api/fields/:fieldId/advice` returns:

| key | what it is |
|---|---|
| `watering` | `{ status, label, reason, driestSensorName, driestValue, sensors }`. `status`: `water_today`, `wait`, `no_recent_reading`, `check_sensors` (every reporting sensor is faulty), `not_configured` (irrigated, no trigger saved), `rain_fed`. Also `driestSensorId`. Only trusted sensors count (see `sensorHealth`). |
| `waterBy` | `null`, or for an irrigated field with a trigger: `{ kind, text, ... }`. `kind`: `window` (`window: { earliest, latest, ifNoRain }`, ISO times), `now`, `beyond` (`days`), `learning` (`needs`). `text` is ready to show, e.g. "Water by Thu–Fri." |
| `setup` | `{ irrigated, trigger, soil }` |
| `sensorHealth` | `[{ sensorId, sensorName, status, reason }]`. `faulty` (stuck, impossible value, spike without rain) is left out of `watering`; `check` (reads far from the others, or barely rose in the last soaking) still counts. Show `reason` as "Check sensor: …". |
| `events` | Detected wettings, newest first: `[{ start, peak, label, detected, source, confidence, rainMm, rises: [{ sensorId, sensorName, rise, low }] }]`. `label` is what to show (`irrigation`, `rain` or `none`); `detected` is the app's own label; `source` is `farmer` when the farmer labelled it. Offer "Watered? Yes / No, it rained / Neither" through the feedback route. |
| `lastWatered` | Start of the newest event labelled irrigation, or `null` |
| `fieldCapacity` | `{ value, from, basis, samples }` measured after a soaking, or `null` |
| `triggerSuggestion` | `{ value, fieldCapacity, wiltingPoint, depletion, basis }` or `null`. A suggestion only: it is used after the farmer saves it as `trigger`. |
| `learning` | Plain-words list of what the app is still waiting for, e.g. "a soaking rain or irrigation" or "a soil type (one of: …)" |
| `weather` | `{ rainNext48hMm, overnightLowC, hours }` |
| `alert` | The open watering alert when status is `water_today`, else `null` |

A soil-moisture reading through `/api/ingest` that is below an irrigated field's trigger runs the same advice, so the alert opens without anyone opening the page. The device's reply does not wait for it.

Weather comes from Open-Meteo (temperature, rain and FAO-56 ET0, the last 14 days and the next 5, cached for 30 minutes per location). Set `WEATHER_STUB_DIR=data/weather` (and optional `WEATHER_STUB_FORECAST`, `WEATHER_STUB_HISTORY`, `WEATHER_STUB_RECENT`) to use fixed files instead: the forecast file is moved to start at the current hour, and `recent.json` gives rain as hours before now. Planting history currently needs the stub `history.json` (live Open-Meteo history is not wired yet).
## Demo accounts (test app)

`scripts/seed-demo.ts` has created the two demo farmers with their farms and fields, two sensors per field ("North probe", "South probe") and 14 days of simulated readings. Run it again right before a demo so the readings end at "now":

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
9. Sensors: register (show the device key once with a copy button), list with each sensor's `latest` values, revoke. The frontend's light reading is not one of the six types yet; adding it is a one-line backend change if the team wants it.
