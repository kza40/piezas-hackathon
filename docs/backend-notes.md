# Backend notes: Piezas spike results (step 0)

Measured on 2026-11-07 against the TEST copy of the app with `scripts/spike/step0.ts`
(`npx tsx --env-file=.env scripts/spike/step0.ts`). All spike records and the spike user were deleted afterwards.
The `spikeday` record type itself is still defined in the test app (harmless).

## What we measured

| # | Question | Result | What it means for us |
|---|---|---|---|
| E1 | `defineEntities` | Works (~300 ms). Returns a map of clients. The dynamic `piezas.<plural>` accessor was not set. | Always use the map returned by `defineEntities`. `scripts/seed.ts`'s `upsert()` relies on `piezas[accessor]` and must be rewritten. |
| E2 | Create + get | Works. Top-level `ownerId` is `null` for records created with the API key. | Owner isolation cannot use the platform `ownerId`. We store `ownerId` in `data` and filter on it. |
| E3 | Undeclared fields, nested JSON | Accepted and returned as-is (objects and arrays). | The schema is not enforced, so validation is our job. Readings can be stored as a native JSON array; no string encoding needed. |
| E4 | Duplicate titles | Allowed (2 records with the same title). | Titles are not keys. Dedupe by title does not work. |
| E5 | `list({ filter })` on a data field | Exact match works. Title `search` works. | Lookups by `ownerId`, `fieldId`, `sensorId` are fine. (Filter with two keys at once not yet tested.) |
| E6 | Payload size | 1 KB to 4 MB in one field all accepted and returned intact. | A day of hourly readings (about 1 to 2 KB) is far below any limit. |
| E7 | Sequential create latency | p50 26 ms, p95 28 ms (from a laptop in BC). | Fast enough to compute advice on read. |
| E8 | 25 parallel creates | All succeeded, no rate limiting. | Real ceiling not found; do not rely on more than this. |
| E9 | Bulk `import` of 200 + replay with the same idempotency key | 200 created in 738 ms. The replay created 200 MORE (idempotency key not honoured). | Bulk import is good for loading synthetic data, but the loader must be idempotent itself. Retries can duplicate. |
| E10 | `limit` above 100 | Rejected with HTTP 400 (not silently capped). | Clamp `limit` to 100 and paginate with `offset`. |
| E11 | Sorting | `sort: created_at, order: desc` works. Sorting by a data field is rejected. | Sort reading times in our code, never through the API. |
| E12 | Read after write | Immediately visible through both title search and filter. | No eventual-consistency workaround needed. |
| E13 | Update semantics and races | `update({ data })` MERGES top-level data keys. 20 parallel read-modify-write increments ended at 7, not 25. | Partial updates are safe for flat keys. There is no optimistic locking, so concurrent read-modify-write loses data. |
| E14 | Delete | `get` afterwards returns `not_found`; no longer listed. | Retention (deleting old day records) is possible. |
| E15 | Users | `configurePolicy({ requireEmailVerification: false })` works with the app key. Sign-up returns an `active` user but no token. `signIn` returns `{ user, session }`. `getSession` returns `{ valid, user, claims }`. | Sign-up flow: sign up, then sign in to get the session. The same policy call must be run once on the LIVE app before the first real sign-up. |

Also: the SDK warns that the platform contract is v15 while `@piezas/sdk` 0.5.2 was built against v11. Upgrade the SDK (`npm install @piezas/sdk@latest`) at the start of step 2 and re-run this spike.

## Design changes from the plan

1. **Owner isolation:** every record stores `data.ownerId` (the Piezas user id from the verified session). Every list filters by it; every get-by-id checks it and answers 404 when it does not match.
2. **Readings stay as day rollups**, one record per sensor + type + day, with `data.values` as a native array of `{ t, v }`. Keep 14 days. With 6 types that is at most 84 records per sensor, so the field view loads each sensor's history with ONE `list({ filter: { sensorId } })` call (under the 100 limit).
3. **Latest values on the sensor record** use flat keys (`latest_soil_moisture_value`, `latest_soil_moisture_time`, and so on), because updates merge only top-level keys.
4. **No duplicate or lost writes:** titles are not unique and idempotency keys are not enforced, and concurrent updates lose data. So all writes that read first (day rollups, sensor latest values, "open alert" checks) go through an in-process keyed lock (one queue per record key). This is correct only if the app runs as a single server instance; check that on the first deploy.
5. **Alerts:** "is there an open alert for this field?" is a filter on `{ fieldId, status: 'open' }` inside the lock, then create.
6. **Synthetic data loader:** builds whole day records in memory and writes them with `import`. Before loading, it deletes the existing synthetic records for the same owner, so running it twice does not duplicate.
7. **Seed script:** rewrite `scripts/seed.ts` to call `defineEntities` and use the returned clients.

## Still unverified

- Hosting: single instance or not, memory, request size, cold starts. Plan: deploy a minimal app early in step 2.
- Rate-limit ceiling above 25 parallel requests.
- `filter` with two keys at once, and filtering on numbers.
- Whether the upgraded SDK changes any of the above.
