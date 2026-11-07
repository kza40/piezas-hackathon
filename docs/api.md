# Backend API (step 2: accounts, farms, fields)

What the backend expects from the frontend and what it returns. All bodies are JSON. Errors always look like:

```json
{ "error": "invalid_input", "message": "Latitude must be between -90 and 90." }
```

`message` is written for the farmer and can be shown as-is. `error` is one of `invalid_input` (400), `unauthorized` (401), `account_pending` / `mfa_required` (403), `not_found` (404), `conflict` (409), `server_error` (500).

The session is an httpOnly cookie named `piezas_session`, set by the backend. The frontend never reads or stores the token; it just sends requests with cookies (`credentials: 'include'` with `fetch`, the default for same-origin).

The backend logic lives in `lib/server/` and is done. The HTTP routes below are the thin layer still to add once the frontend's framework setup is merged, so the paths can still change if the frontend needs something different.

## Accounts

| Method and path | Body | Returns |
|---|---|---|
| `POST /api/auth/sign-up` | `{ email, password }` (password at least 8 characters) | `{ user: { id, email } }` and sets the cookie. If the email already has an account with a different password: 409 "An account with this email already exists. Sign in instead." The same email and password just signs in. |
| `POST /api/auth/sign-in` | `{ email, password }` | `{ user }` and sets the cookie. Wrong email or password: 401 "Email or password is incorrect." |
| `POST /api/auth/sign-out` | none | 204 and clears the cookie |
| `GET /api/auth/me` | none | `{ user }`, or 401 when signed out (use it to decide whether to show the sign-in page) |

## Farms, fields, crops (all need a signed-in farmer)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/crop-profiles` | none | `{ cropProfiles: [{ id, key, name, moistureMin, moistureMax, phMin, phMax, ecMax, frostRiskC }] }` |
| `GET /api/farms` | none | `{ farms: [{ id, name, latitude, longitude, createdAt }] }` (empty for a new farmer) |
| `POST /api/farms` | `{ name, latitude, longitude }` (numbers, or numeric strings) | `{ farm }` |
| `GET /api/farms/:farmId` | none | `{ farm }` |
| `GET /api/farms/:farmId/fields` | none | `{ fields: [{ id, farmId, name, cropProfile, createdAt }] }` |
| `POST /api/farms/:farmId/fields` | `{ name, cropProfileId }` (an `id` from `/api/crop-profiles`) | `{ field }` with the full `cropProfile`, so the moisture and pH ranges can be shown straight away (S-002) |
| `GET /api/fields/:fieldId` | none | `{ field }` (sensors, readings and advice are added in later steps) |

Another farmer's farm or field always answers 404, exactly like one that does not exist.

## What the frontend must collect

- Sign-up and sign-in: email and password.
- New farm: a name and the farm's **latitude and longitude** (needed for the weather). An address alone is not enough: the backend does not geocode addresses.
- New field: a name and a crop chosen from `/api/crop-profiles` (only Blueberry for now).
