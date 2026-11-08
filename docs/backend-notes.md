# Backend notes: Piezas spike results (step 0)

Measured on 2026-11-07 against the TEST copy of the app with `scripts/spike/step0.ts`:

```
npx tsx --env-file=.env scripts/spike/step0.ts
```

The script cleans up everything it creates and exits 1 if any design assumption below stops holding, so re-run it after upgrading `@piezas/sdk`. It leaves the `spikeday` record type defined in the test app (harmless) and sets `requireEmailVerification=false` on the test app.

## What we measured

| # | Question | Result | What it means for us |
|---|---|---|---|
| E1 | Entity accessors | `defineEntities` returns a map of clients. It also sets `piezas.<plural>`, but the pluralizing is naive (`spikeday` became `piezas.spikedaies`). | Always use the map returned by `defineEntities`. `scripts/seed.ts` runs in its own process and never calls `defineEntities`, so its `piezas[accessor]` lookups find nothing; it must define the entities first. |
| E2 | Create + get | Works. Top-level `ownerId` is `null` for records created with the API key. | Owner isolation cannot use the platform `ownerId`. We store `ownerId` in `data` and filter on it. |
| E3 | Undeclared fields, nested JSON | Accepted and returned intact (objects and arrays). | Readings can be stored as a native JSON array. |
| E3b | Required fields | Enforced: a create missing a required field is rejected (`validation_failed`). | Declared `required` fields are a real constraint. |
| — | Changing a schema | `defineEntities` NEVER changes an existing schema. It logs "schema drift" and keeps the stored one. Schemas are per app (the live app has none of the test app's). | Decide fields before the first run, and keep `required` to the minimum (`ownerId` plus true keys). A later change needs an explicit schema update, or a new slug. |
| E4 | Duplicate titles | Allowed. | Titles are not keys. Dedupe by title does not work. |
| E5 | `list({ filter })` | Exact match on one data key works; two keys are combined with AND. | Lookups such as `{ ownerId }`, `{ sensorId }`, `{ fieldId, status: 'open' }` work in one call. |
| E6 | Payload size | 1 KB to 4 MB in one field accepted and returned intact. | A day of hourly readings (about 1 to 2 KB) is far below any limit. |
| E7 | Sequential create latency | p50 about 25 ms, p95 about 35 ms (from a laptop in BC). | Fast enough to compute advice on read. |
| E8 | 25 parallel creates | All succeeded, no rate limiting. | Real ceiling not found; do not rely on more than this. |
| E9 | Bulk `import` of 200, then a replay with the same idempotency key | 200 created in about 0.7 s. The replay stored nothing new (200 records total); its response just echoes the first one (`created: 200`). | Import with an idempotency key is retry-safe. (Single-record `create` ignores idempotency keys per the SDK docs; not relied on.) |
| E10 | `limit` above 100 | Rejected with HTTP 400. | Clamp to 100 and paginate with `offset`. |
| E11 | Sorting | `created_at` / `updated_at` / `title` only; data fields rejected. | Sort reading times in our code. |
| E12 | Read after write | Immediately visible through a filter. | No eventual-consistency workaround needed. |
| E13 | Update semantics and races | `update({ data })` merges top-level data keys. 20 parallel read-modify-write increments on one record ended at 6 to 7, not 25. | Partial updates are safe for flat keys. No optimistic locking: concurrent read-modify-write loses data. |
| E14 | Delete | Record is gone (`not_found`). | Retention (deleting old day records) is possible. |
| E15 | Users | `configurePolicy({ requireEmailVerification: false })` works with the app key. Sign-up returns an `active` user but no token. `signIn` returns `{ user, session }`; `getSession` returns `valid: true`. | Sign-up flow: sign up, then sign in. The same policy call must be run once on the LIVE app before the first real sign-up. |

Found while building step 2:

| # | Question | Result | What it means for us |
|---|---|---|---|
| E17 | `null` in a declared field | Rejected: a declared `number` field with `null` fails validation ("got null, want number"). | Leave unknown values out of the record instead of writing `null`. |
| E18 | Users policy defaults | Passwords need at least 10 characters; sessions last 30 minutes (1800 s); 10 wrong passwords in 15 minutes locks sign-in; cookie name `piezas_session`. | Our password check is 10 characters too; `scripts/setup-app.ts` sets 7-day sessions; the frontend's 7-character demo passwords had to change. |
| E16 | Signing up again with an existing email | "Succeeds" and returns a different, fake user id. Only one account exists, and only the original password signs in. | Piezas hides which emails are registered. Our sign-up turns the following sign-in failure into a 409 "already exists, sign in instead". |
| E19 | `createdAt` precision | Whole seconds (`2026-11-08T03:56:39Z`). Two records made in the same second tie. | Lists sort by `createdAt` then id (`oldestFirst` in `lib/server/data/records.ts`), so the order never flips between requests. Alerts keep their own millisecond `openedAt` for "newest first". |

The SDK also warns that the platform contract is v15 while `@piezas/sdk` 0.5.2 was built against v11. As of 2026-11-07, 0.5.2 is the newest published version, so there is nothing to upgrade to yet; re-run the spike when a newer SDK appears.

## Design decisions from this

1. **Owner isolation:** every record stores `data.ownerId` (the Piezas user id from the verified session). Every list filters by it; every get-by-id checks it and answers 404 when it does not match.
2. **Readings as day rollups:** one record per sensor + type + day, with `data.values` as a native array of `{ t, v }`. Keep 14 days, so a sensor has at most 84 day records and its whole history loads with one `list({ filter: { sensorId } })` call.
3. **Latest values on the sensor record** use flat keys (`latest_soil_moisture_value`, `latest_soil_moisture_time`, ...), because updates merge only top-level keys.
4. **No lost or duplicate writes:** titles are not unique and concurrent read-modify-write loses data, so every read-then-write (day rollups, sensor latest values, "is there an open alert?") goes through an in-process lock keyed by the record key. This is correct only if the app runs as one server instance; check that on the first deploy.
5. **Alerts:** inside that lock, look up `{ fieldId, status: 'open' }`; create only if none exists.
6. **Synthetic data loader:** builds whole day records in memory and writes them with `import` plus an idempotency key. Re-running with new data first deletes the owner's existing synthetic records.
7. **Schemas:** define all entities in one shared module used by the app and `scripts/seed.ts`; keep `required` minimal because a stored schema does not change on its own.

## Still unverified

- Hosting: single instance or not, memory, request size, cold starts. Plan: deploy a minimal app early in step 2.
- Rate-limit ceiling above 25 parallel requests.
- Filtering on number fields.
- How to update a stored schema (`piezas.entities` has schema update methods; untested).
- Whether the upgraded SDK changes any of the above.
