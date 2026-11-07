## Backend - Piezas.ai

This app uses Piezas for business backend services. Keep the generated app focused on UI, routing, auth/session glue, workflow-specific orchestration, and calls to Piezas APIs.

This contract is served whole (what you are reading now) and in TOPIC SLICES. Call
`piezas_contract` with a `topic` argument to pull only the rules for the step you are
on: `core`, `entities`, `users`, `integrations`, `calendar`, `documents`, `deploy`,
`testing`, `patterns`. Read `core` first, then fetch the slice for a service before
you write code against it. With no `topic` you get this whole document.

### Start Here

1. Decide the deployment mode before choosing a framework or creating routes.
2. Read `piezas.manifest.json`; it is the machine-readable ownership/deployment source of truth.
3. If the user asks for `/piezas-spec`, `/pieza-spec`, `piezas-spec`, or Piezas spec mode, read `.piezas/spec-builder.md`, interview the user one question at a time, write `SPEC.md` or `specs/`, then show the user a short summary (never the whole document) with your assumptions stated plainly, and go straight to the mock. Never ask "Want to see it?", "Right?" or to confirm the summary: the mock and the owner's "approve" are the one confirmation.
4. When coding starts, read `SPEC.md` or `specs/` before writing application code.
5. Build the mock first. Milestone 0 is UI plus seed data, deployed or served for the customer to react to, BEFORE any backend wiring. See Milestone 0 - Mock First (topic `testing`).
6. Give every requirement in the spec an `S-xxx` acceptance scenario. Every scenario becomes a test the app must pass before it is shared: `piezas test` creates a failing placeholder per scenario, you write the real test, and a deploy needs a passing run of this exact code. See Scenario Coverage (topic `testing`).
7. Use `@piezas/sdk` for Entity Records, Pipeline, Tasks, Notifications, Integrations, Workflow jobs, Calendar, Admin/access, Messaging, Forms, Documents, Reporting, Pricing, Discussion, Knowledge Base, and Users (end-user accounts and sessions).
8. Use the live OpenAPI specs to verify request/response details before calling less common endpoints or provider-specific integration actions.
9. Do not create custom database tables for Piezas-backed business data.
10. Do not store third-party OAuth access tokens, refresh tokens, provider client secrets, or sync cursors in this app. (Sign in with Google or Microsoft is the one case where the app holds a provider client secret: only as a hosting environment variable, through `@piezas/sdk/sso` — see topic `users`.)
11. Store Piezas IDs as references: record IDs, pipeline item IDs, connection IDs, and grant IDs.
12. If the app uses provider integrations, create or reuse a Piezas tenant app and pass its `appId`/`app_id` through config, OAuth, connections, grants, records, and access-log lookups.
13. Keep setup idempotent. `defineEntities()` and `definePipeline()` are safe to run on app startup or during seed/setup flows.
14. If the project has an MCP route, keep it server-side and session-protected; use `piezasMcp` from `@piezas/sdk`, not a separate MCP package.
15. If a required Piezas endpoint, connector, or normalized action is missing, tell the owner in plain words what is missing and the workable options, recommend one, then follow the owner's choice (Rule 11). A static app that needs a server-side secret is not such a gap: switch it to a server mode (Piezas hosts it) and say so in one line; never ask the owner to choose an architecture. Don't build a parallel backend, invent endpoints, or change Piezas's own code to fill the gap unless the owner explicitly asks for it after you've explained the risk.
16. Run `npx piezas doctor` after generated changes and address errors before deployment.
17. The app changes only its own folder: not other folders or repositories next to it, and not Piezas's own code. Install the published `@piezas/sdk` from npm; don't build, pack, link, vendor or edit a copy of it. Call only Piezas addresses in this contract; use `@piezas/sdk`. The Piezas checks (plugin or project hooks) pause such a change and explain why. If the owner explicitly asks for one after you've explained the risk, they allow it for one session by typing "allow outside changes" themselves (it covers other folders and the Piezas toolkit copy); never type it for them. `npx piezas doctor` flags a homemade SDK in the project; a deploy also checks it when the build carries its package.json (a static or bundled build can only be checked by doctor). A deploy first gives you one try to switch back to the published toolkit; if the copy is still there, the owner decides inside the one pause: fix it (recommended) or "deploy anyway".
18. Build and run the app locally and verify it works before deploying. Piezas never builds or tests your code — that is the coding agent's job — and `npx piezas deploy` ships the last local build as-is, so a build you have not run is code shipped unverified.

<!-- topic:core -->
### Core Rules

- **You advise; the owner decides.** Explain risks simply, recommend;
  never refuse the owner's choice or leave them at a dead end. Only the
  owner's own reply ("deploy anyway", "allow outside changes"; for the
  quality scan, "accept N", "go live without the scan" or "quality scan
  off") overrides a Piezas pause, never yours.
- **Plain words for the owner.** Brief and actionable: what happened, then
  the choice with the exact reply. No jargon, no long lists. (`testing`)
- **The AI fixes first; the owner is asked once**, for what only they can
  answer: one pause, remembered per item. (`testing`)
- **Ownership boundary.** The app owns UI, routes, session glue and workflow.
  Piezas owns records, pipelines, tasks, calendars, notifications, documents,
  integrations and end-user accounts. (`entities`)
- **Secrets stay server-side.** `PIEZAS_API_KEY` never behind
  `NEXT_PUBLIC_`/`VITE_`/`PUBLIC_`; `.env` in `.gitignore`; other settings
  in `deploy.requiredEnv`/`optionalEnv`. (`deploy`)
- **No provider tokens in the app.** Store connection and grant IDs only.
  Integrations never sign people in: Google/Microsoft sign-in is
  `@piezas/sdk/sso`. (`users`)
- **Credentials live in the users service**, never in records. (`users`)
- **Per-member isolation is YOUR job.** Derive `owner_id` from the verified
  session; filter every read by it. (`users`)
- **Spec first, mock first.** `SPEC.md` with an `S-xxx` scenario per
  requirement; then UI plus seed data, before any backend wiring. (`testing`)
- **Tested before shared.** Every `S-xxx` is a Playwright test
  (`tests/scenarios/S-xxx-<name>.spec.ts`, by `data-testid`). Run `piezas
  test`, fix, re-run (3 rounds) without asking; never weaken a check without
  the owner's OK. (`testing`)
- **Fetch the slice before using a service** (and before deploying):
  `piezas_contract` with its `topic`.
- **Rule 11 — If Piezas doesn't offer it, say so.** Check
  `piezas_capabilities` (.piezas/rules/capabilities.json) before promising.
  If it's missing, say so with the workable options, recommend one, then
  follow the owner's choice. Don't change Piezas's code (backend, SDK, CLI,
  MCP) or invent endpoints unless the owner explicitly asks, knowing the risk.
- **Change only the app's folder.** Use the published `@piezas/sdk`; no
  homemade copy, and no Piezas address outside this contract. Once they know
  the risk, only the owner may type "allow outside changes".

### Hard No List

Never do these on your own. If the owner asks, explain the risk and recommend
the Piezas way; a deploy that breaks one pauses until the owner fixes it or
says "deploy anyway".

- No local database tables for Piezas-backed business objects.
- No OAuth token storage, token refresh jobs, or integration OAuth callbacks in the app.
- No scraping or undocumented provider API calls when a Piezas connector exists.
- No exposing `PIEZAS_API_KEY` to browser code.
- No public MCP route without app auth, tenant checks, and server runtime.
- No hand-written OAuth/OIDC sign-in (use `@piezas/sdk/sso`).
<!-- /topic:core -->

<!-- topic:testing -->
### Spec-First Workflow

The recommended workflow is init, spec, mock, then code:

1. `npx piezas init`
2. Generate a product spec:
   - Claude Code: run `/piezas-spec [optional product idea]`.
   - Cursor, Codex, and Windsurf: ask for `/piezas-spec`, `/pieza-spec`, or "Piezas spec mode".
3. In spec mode, read `.piezas/spec-builder.md`, ask one question at a time, and write `SPEC.md` for MVPs or `specs/` for larger handoffs.
4. Give every requirement in the spec a numbered acceptance scenario (`S-001`, `S-002`, ...) written Given/When/Then. A requirement with no scenario is an unfinished spec.
5. After writing the spec, show the short summary and go straight to the mock; never ask "Want to see it?", "Right?" or to confirm the summary. Do not wire any backend until the customer has approved the mock.
6. Build milestone 0 — the mock: UI plus seed data, delivered for the customer to react to, with no backend wiring at all.
7. Only after the customer has reacted to the mock, in code mode, read the finalized spec, map every backend need to Piezas services, then implement the UI/workflow layer against Piezas.
8. Write the real test for each scenario as the features land; `piezas test` must pass before the first deploy.

### Milestone 0 - Mock First

Milestone 0 of every build is a MOCK: the UI, wired to seed data, deployed or
served so the customer can open it and react — BEFORE any backend wiring.

- Build the screens from `SPEC.md` against realistic seed data held in a local
  fixture module (for example `lib/seed/*.ts`). The seed data is not in Piezas and
  not in a local database; it is a plain module the UI imports.
- No SDK calls, no `PIEZAS_API_KEY`, no server route handlers, no `app/api/**` in
  milestone 0. The mock is deliberately hollow — that is what makes it cheap to
  throw away when the customer says "not like that".
- Deliver it. Deploy it, or serve it on a URL the customer can open, and ask them
  to react to it. Intent is the customer's call to make; correctness is the tests'.
  A mock that only ever ran on your machine has not done its job.
- The customer's approval of the mock IS their sign-off on the spec. Show them
  the screens and a link they can click, not the document, and flag the
  requirements you assumed so they can check those.
- Only once the customer has approved the mock do you wire Piezas in, screen by
  screen, replacing seed fixtures with real service calls.
- Keep the fixtures afterwards. They become the deterministic data the scenario
  tests run against.

### Scenario Coverage

Every requirement in `SPEC.md` carries an acceptance scenario with a stable id
(`S-001`, `S-002`, ...). Every scenario is a test the app must pass before it is
shared, and the owner is a non-technical business owner: they never read tests.

1. **Every requirement has a scenario.** A requirement with no `S-xxx` scenario is
   an incomplete spec. List the records the app keeps under `## Data`
   (`- Contact: name, email, phone`). A scenario that depends on an outside service
   (Google or Microsoft sign-in, Stripe or other payments, a real inbox, text
   messages, another company's system) gets a `needs: <service>` line, and you ask
   the owner once, in plain words, for a test account for it (remember "none for
   now"). They set any password themselves, never in chat. Without one, that scenario is "needs your help" and is
   listed at every deploy; it is never silently skipped.
2. **Every scenario starts as a failing test.** `piezas test` (and starting the
   build) writes `tests/scenarios/S-xxx-<name>.spec.ts` for each scenario without
   one: a placeholder that fails until written. You replace its body; keep its first
   line (`// piezas-scenario: S-xxx v=...`), which records which wording of the
   scenario it was written for. Existing tests are never overwritten.
3. **Write real tests.** From the scenario's Given/When/Then: open the page
   (`page.goto`), do what the When line says (click, fill, ...), and check what the
   Then line says is visible (`await expect(page.getByTestId(...))...`). Select by
   `data-testid`. `piezas test` rejects, as not written, a test that never opens the
   app, never interacts, checks nothing visible, has an always-true check, uses
   `test.skip`/`.only`/`.fixme`, swallows failures, or fakes Piezas (intercepting its
   requests, mocking the SDK).
4. **Test against the test copy with made-up data.** `piezas test --setup` (and
   `piezas init` when signed in) creates "<App name> (test)"; its key goes to `.env`
   as `PIEZAS_TEST_API_KEY` and `piezas test` starts the app with it. Never point
   tests or seed data at the live app. `scripts/seed.ts` creates realistic made-up
   records (example.test emails) idempotently, plus a test sign-in user activated
   directly with the test key, so sign-in checks need no inbox.
5. **Run, fix, explain.** `piezas test --json` lists each scenario as passed,
   failed, not written, needs your help, skipped by the owner, or changed checks.
   Each failing test is retried once automatically. A failing or missing check is
   your work, not a question: fix, write the missing checks and re-run, three
   rounds, without asking the owner whether to keep fixing; pass on only the one
   progress line ("Checking the app… 3 checks written, 1 fixed, running again
   (round 2 of 3)."). Each failure has a plain sentence built from the scenario's
   own words, with a screenshot for you in `.piezas/test-results/`. What still
   fails after the rounds reaches the owner only through the deploy's one pause.
   A failure marked out of date means the scenario changed: update the test, not
   the app.
6. **Never weaken a check without the owner's OK.** Once a test passes its checks
   are recorded. If you remove or loosen one, the run reports changed checks: tell
   the owner why in one plain sentence, then end your message with the exact line
   Piezas printed for that part ("The check for “Create a contact” was rewritten by
   your AI tool after it last passed. If you asked for that change, reply "yes
   Create a contact". If not, reply "keep fixing" and it will explain what it
   changed and why.") and wait. Only a reply that names the part ("yes Create a
   contact", or its id) is their OK; a bare "yes" is not, so ask exactly "Which
   check did you mean? Reply yes and its name, for example yes Create a contact."
   Only after their OK, run `piezas test --accept-change S-xxx --reason "..."`,
   then `piezas test` again.
7. **A passing run of this exact code, green before any deploy.** The record
   (`.piezas/test-attestation.json`) is bound to the code, the tests and the
   scenarios, and is valid for 24 hours. Otherwise the deploy stops for YOU first:
   run the checks, fix, write the missing ones (three rounds; a version with no
   check run gets three tries) while the owner sees one progress line. Only then
   is the owner asked, once, in the one pause: "Keep trying: your AI tool gets
   three more rounds." or "Deploy anyway" (no numbers, no menu of parts). They
   can still type "skip" and a part's name ("skip Create a contact") or "deploy
   anyway" at any time; "list" shows every part. A rewritten check is approved
   only by "yes" and the part's name or id; a bare "yes" is not. Only the
   owner's own reply counts; never answer for them. With `piezas_deploy`, put
   `.piezas/test-attestation.json` (and `.piezas/test-decisions.json`) at the
   top of the artifact (Piezas removes it before the app goes live).
8. **Bugs become tests first.** A defect found after launch gets a failing scenario
   test, then the fix. The scenario stays forever.

### Quality Scan

A quality scan is a second, separate check of the work against what the owner
approved, run in the owner's own AI tool (it uses their AI plan's allowance,
roughly like one more build step). To the owner it is part of "checking the
app", and when named always the "quality scan", never a "review" or an "audit".

1. **On by default; only the owner's reply changes it.** In a Piezas project
   the scan is on; there is no consent question. The owner can say "quality
   scan off" or "quality scan before publishing only" (or "quality scan on")
   any time. The Piezas checks (plugin or project hooks) record it from the
   owner's own message when they run, where "deploy anyway" is kept
   (`.piezas/owner-approvals.json`, or the approvals in `.piezas/state.json`).
   Without those checks, relay the owner's exact words:
   `npx piezas quality-scan off --owner-reply "<their words>"` (also `on`,
   `before-publishing`, `skip`, `accept <n>`); the words must say the same
   thing, and the record says it was relayed. Never ask the owner to type a
   command. You never turn it on or off on your own, never relay words they
   did not say, and never write that record.
2. **Run it in a separate context.** When it is on, before you call a build
   step done (with "only before publishing", before a deploy):
   - Tell the owner in one line: "Checking the app… running the quality scan."
   - Run `npx piezas quality-scan packet`. It writes what the scan reads and
     its instructions, `.piezas/quality-scan/prompt.md`; never edit them.
   - Run the scan from that file only, never in your own conversation. Claude
     Code: a subagent (general-purpose) whose whole prompt is "Read
     <project>/.piezas/quality-scan/prompt.md and do exactly what it says."
     Add nothing of your own: no notes, summary or opinion about the work.
     Codex: a fresh session, `codex exec --ephemeral -s workspace-write -C
     "<project>" - < "<project>/.piezas/quality-scan/prompt.md"`; if that
     cannot run, a subagent whose only instruction is to read that file and
     follow it.
   - The scan writes `.piezas/quality-scan/findings.json`. Never write or
     change it yourself.
   - Run `npx piezas quality-scan verdict`. It writes
     `.piezas/quality-attestation.json` (for this code, valid for 24 hours) and
     prints what the owner sees: "Quality scan: 2 things to look at.", then each
     one in a plain sentence. Tell them that, as it is.
   With the Piezas checks and the scan on, "done" is held until the scan has
   run, and they give you these same steps. With "only before publishing", that
   hold starts only after `npx piezas deploy` stopped for the scan; a
   `piezas_deploy` call does not start it, so when `piezas_deploy` says the
   scan is needed, run these steps yourself.
3. **Fix, at most 3 rounds.** Fix each open problem without asking, unless
   the fix needs something only the owner has (sample data, a decision): then
   ask them in plain words. After your fixes the scan runs again on the new
   code. After the third round, stop: what is still open joins the deploy's
   one pause, and you do not start another scan for that work. When the scan is done, run `npx
   piezas test` LAST, on the final code: a deploy needs the test record and
   the scan to be of the same code.
4. **Only the owner accepts.** The owner sets a problem aside by saying
   "accept" and its number ("accept 2") or "accept all". Never say it, write it
   or mark a problem accepted for them; if they say "accept" while several are
   open, ask which. To put one version live unscanned, the owner says "go
   live without the scan": it covers this code once (a skip from before the
   last scan, or over 24 hours old, no longer counts), and the setting stays.
   The Piezas checks record that reply when they run; otherwise relay their
   exact words (`npx piezas quality-scan skip --owner-reply "<their words>"`).
5. **A deploy needs a current scan while it is on.** With either setting, `npx
   piezas deploy` and `piezas_deploy` need a scan of this code from the last 24
   hours with nothing open. Otherwise nothing goes live and the stop is yours
   (the owner reads one line: "Checking the app… running the quality scan." or
   "… found 2 things to fix; your AI tool is fixing them (round 2 of 3)."): run
   the scan, fix, scan again. After the third round, what is left joins the one
   pause ("2 things the quality scan found that your AI tool couldn't fix:"),
   where the owner says "accept 2" / "accept all" or "deploy anyway"
   (remembered per problem); "go live without the scan" (this once) and
   "quality scan off" (for good) still work. With `piezas_deploy`, put
   `.piezas/quality-attestation.json` and the owner's records
   (`.piezas/owner-approvals.json` or `.piezas/state.json`) at the top of the
   artifact, next to the test record. While the scan is on and the build has
   no readable test record, which code was scanned cannot be told: the test
   pause says so, and the owner's "deploy anyway" there covers both, for that
   build only. With no owner records in the build, the deploy goes on and says
   "Piezas couldn't see your choice about the quality scan, so this version
   was not scanned." The owner's setting lives in the project's own records;
   the server trusts what the artifact carries. With the scan off, the deploy
   says so in one line and goes on.

### Plain Words for the Owner

The owner is a non-technical business owner. Everything you tell them is
brief, simple and, above all, actionable: they should know what to do next
without asking what a word means.

1. **Plain words, then the action.** Every message to the owner (deploy
   pauses, check results, quality scan findings, errors, questions) follows one
   shape: what happened (one sentence), what it means for them (one sentence,
   only if not obvious), what they can do now (the choices in words, one line
   each, with the exact words to reply). Keep each sentence under about 25
   words.
2. **Never list what you can count.** "23 parts have no check yet: A, B, C,
   and 20 more" beats 23 lines. Lead with what needs a decision; put what works
   in one line.
3. **Words that never reach the owner:** fingerprint, attestation, scenario,
   spec, artifact, manifest, env var, endpoint, token, hash, stdin, PKCE, slug.
   Say "part of the app", "check", "setting", "address", "sign-in" instead. If a
   technical word is unavoidable, follow it once with what it means in plain
   words.
4. **Ask only questions the owner can answer.** Not "the check was changed,
   OK?" but "The check for X was rewritten by your AI tool after it last passed.
   If you asked for that change, reply 'yes X'. If not, reply 'keep fixing' and
   it will explain what it changed and why."
5. **Name checks as outcomes a customer would say.** "Only my own company's
   tickets show up", not "Single-company support" or "Versioned event
   contract". When you write or revise `SPEC.md`, give every scenario such a
   plain sentence as its title: it is what the owner sees at deploy.
6. **Repeat nothing the owner already decided.** When a list is the same as
   last time, say so and show only what is new.
7. **The AI fixes first; the owner is asked once, for what only they can
   answer; one pause, remembered per item.** Never ask what Piezas or you can
   find out (the settings' names, the build folder, the Report a problem
   button, whether to keep fixing). What only the owner can answer (a broken
   rule, missing settings, a rewritten check, parts that still fail after your
   rounds) is one message with one answer, and their answer is kept for each
   thing it covered: the next deploy asks only about what is new or changed.
8. **Taking over an existing app: one question.** Ask once, batched: "I
   recommend moving A, B and C to Piezas. Reply yes, or tell me which to
   keep." "You decide" (or "whatever you think") means go with your
   recommendation, and is recorded as such.

### Implementation Workflow for Coding Agents

1. Read this file before writing app code.
2. Read `SPEC.md` or `specs/` if present. If no spec exists and the request is broad, run Piezas spec mode before coding.
3. Read `piezas.manifest.json` and keep implementation consistent with it.
4. Build milestone 0 — UI plus seed data, no backend wiring — and deliver it for the customer to react to before you wire anything.
5. Identify which Piezas services own each data/workflow need. Fetch that service's contract slice (`piezas_contract` with a `topic`) before you write against it.
6. Define entity schemas and pipelines idempotently.
7. For provider integrations, create or reuse a Piezas tenant app and map each connector to an explicit purpose before starting OAuth.
8. Use SDK wrappers first.
9. Read OpenAPI specs before writing direct REST calls or provider action payloads.
10. Keep secrets and API keys server-side.
11. Build UI and workflow around Piezas references, not local backend tables.
12. If MCP is needed, use `piezasMcp` from `@piezas/sdk` on a protected server route; do not add an MCP route to static-only apps.
12a. Add the Report a Problem button to every app with a server (see Report a Problem Button). Whether it shows is decided at run time, not by the code.
13. Write the real test for every scenario placeholder `piezas test` created in `tests/scenarios/`, plus focused tests for the app's orchestration logic and public/server route validation.
14. Run `npx piezas doctor`; fix errors before claiming the app is ready.
15. The quality scan is on by default: run it on the finished work and fix what it finds, before the last test run (see Quality Scan). Never ask the owner whether to turn it on.
16. Run `piezas test` as the last step before deploying, after the quality scan: build, run the app and verify it, fix and rebuild, then run `npx piezas test`. Fix and re-run, three rounds, without asking; what is left reaches the owner only in the deploy's one pause. If you change anything after the checks pass, run the scan again (while it is on), fix, then `npx piezas test` last.
17. If a required Piezas capability is missing, leave a small adapter boundary and document the missing endpoint/action instead of building a parallel backend.
<!-- /topic:testing -->

<!-- topic:deploy -->
### Framework Choice

Piezas is framework-agnostic. Any language or framework that can make HTTPS
calls works — the platform surface is plain OpenAPI, and `@piezas/sdk` is a
convenience for TypeScript, not a requirement. Do NOT steer the user toward a
specific framework. If they have a preference (including no framework at all),
honor it. If they ask for a recommendation, present real options neutrally —
e.g. Vite + a small Express/Fastify/Hono server, Remix, SvelteKit, Next.js, or
a non-JS stack calling the APIs directly — and let them choose. The only hard
requirements, regardless of stack:

1. `PIEZAS_API_KEY` stays server-side (see Security Rules).
2. Business data lives in Piezas, not a parallel local database.

Mode names like `next-bff` are historical labels: read `next-bff` as "frontend
with a small server layer" in whatever framework the user chose.

### Security Rules

- `PIEZAS_API_KEY` lives in the project's `.env` file (written by `npx piezas init` or downloaded from the dashboard). Read it server-side via `process.env.PIEZAS_API_KEY`; if it is missing, run `npx piezas init` yourself (signed in, it links or creates the app and writes the key); never ask the owner to handle a key.
- `PIEZAS_API_URL` (also written by `init`) points the SDK at the hosted gateway; every service URL derives from it. Without it the SDK defaults to localhost (the local dev fleet) — if Piezas calls fail with ECONNREFUSED, this missing var is the first thing to check. Include it in `deploy.requiredEnv`.
- **Declare every runtime env var the app cannot boot or function without** (provider API keys, session secrets, webhook secrets — anything beyond `PIEZAS_API_KEY`) in `piezas.manifest.json` under `deploy.requiredEnv` (a JSON array of names, never values). Add to it in the same change that introduces the dependency. A deploy compares setting NAMES, never values (this list, the names the built code reads, and the names in the local `.env`; with `piezas_deploy`, run `npx piezas deploy --owner-items` (it uploads nothing) and pass what it prints as `owner_items`; the owner's records in the build decide, and the built code is read when neither has the names), with the HOSTED environment's names before uploading, and the server re-verifies before touching the running app — an accurate list is what prevents crashed first boots. `PIEZAS_API_KEY` is provisioned by Piezas (a missing one is minted, never asked). Never ask the owner whether the settings are set. A missing required one joins the deploy's one pause by name ("Your app uses STRIPE_KEY, but the live app doesn't have it yet. Add it on the app page in the Piezas console (Hosting -> Environment), then deploy again."); they can still reply "deploy anyway", and then the parts that need it won't work until it is set. A setting the app runs without (a provider secret that may not exist yet, a feature flag) goes in `deploy.optionalEnv` instead: declaring it there satisfies `piezas doctor` (PZ023), and deploy only names it in one line ("Not set yet (optional): …").
- Keep `PIEZAS_API_KEY` server-side only. Never expose it in browser code and never prefix it with a public-env marker (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, etc.).
- `.env` MUST be listed in `.gitignore` so the API key is never committed to source control. `npx piezas init` adds it automatically; if you create `.env` yourself (or the file already exists without an ignore rule), add `.env` to `.gitignore` in the same step — a key pushed to a remote is a leaked credential and must be rotated.
- Whatever the framework, call Piezas from the server side (route handlers, server actions/loaders, API endpoints); browser code holds UI state only. (Next.js specifics, when that IS the chosen framework: server components/actions/route handlers make the calls, and tenant-specific fetches need `export const dynamic = 'force-dynamic'`.)
- Do not put OAuth tokens, refresh tokens, provider secrets, API keys, or sync cursors in local storage, cookies, browser state, or app database tables.
- If the app needs its own login, use the Piezas users service (`client.users` server-side, `createPublicUsersClient` in the browser) — see App End-User Auth (topic `users`). For "Sign in with Google / Microsoft", use `@piezas/sdk/sso` (topic `users`). Keep app login separate from integration OAuth: "Sign in with Google" is app auth (`@piezas/sdk/sso`); "connect Google Calendar" is provider data access through Piezas Integrations.
- **NEVER store end-user credentials (passwords, password hashes, reset tokens, session secrets) in entity records or any app table.** The users service owns them. Migrating an app that did this: `users.importUsers` accepts existing hashes (`passwordHash` + `hashScheme`), then delete the credential fields from the records.
- For browser-exposed public flows, use Piezas public sessions or a thin server adapter. Do not pass the main API key to the browser.
- Do not hardcode one tenant-wide provider app for every product. Use the Admin/access app registry so each generated app can have its own allowed origins, callback URLs, connector purposes, and provider credentials.

### Deployment Mode Decision

Before implementation, classify the deployment target and follow the matching constraints.

#### Static Frontend Only

NOT RECOMMENDED YET: static apps depend on public guest tokens, and per-token
permission enforcement has not shipped platform-wide — a guest token currently
carries broader access than its scopes suggest. Steer the user to a
server-capable mode (next-bff or server-runtime) unless they explicitly accept
this and the app touches no sensitive data.

Examples: AWS Amplify static hosting, S3/CloudFront, GitHub Pages, Netlify static export.

Use this mode when the user says "frontend-only", "static", "S3", "static Amplify", or "no app backend".

Rules:

- Prefer Vite/React or Next.js with `output: 'export'`.
- Do not create `app/api/*`, `pages/api/*`, server actions, middleware, route handlers, or server components that require runtime secrets.
- Do not use `PIEZAS_API_KEY`, `ADMIN_PASS`, OAuth client secrets, or provider secrets in deployed frontend code.
- Do not add a deployed `/api/setup` endpoint. For schema setup, create a local script such as `scripts/setup-piezas.ts` that the developer runs locally with `PIEZAS_API_KEY`.
- Do not host an MCP route from the static frontend. If agent tool access is required, use a separate server adapter or change to a server-capable deployment mode.
- End-user sign-in IS supported in static mode: use `createPublicUsersClient` with the app's publishable key (see App End-User Auth). The static-mode caution above is about guest-token DATA access, not auth.
- If the requested workflow requires a server-side secret, token exchange, webhook receiver, admin password, or provider callback, switch the app to a server-capable mode (Frontend With Server Runtime; Piezas hosts it) and tell the owner in one line. Never ask them to choose an architecture.

Static-only apps can safely store public UI state and Piezas reference IDs, but they cannot securely hold backend secrets.

#### Frontend With Server Runtime

Examples: Next.js on Amplify SSR, Vercel, Render, or any deployment that runs server code.

Rules:

- **A Next.js app in this mode MUST set `output: 'standalone'` in its Next config (`next.config.js`/`.mjs`/`.ts`) from the moment the file is created.** `npx piezas deploy` ships `.next/standalone/server.js`, and only that line makes the build produce it. Nothing before deploy day needs it — `npm run build` succeeds, `next dev` and `next start` both work — so a config that is missing it looks healthy for days and then fails at the first deploy with nothing to ship. Write the line with the config, never after the deploy breaks. (`npx piezas doctor` flags a server-mode config that lacks it.)
- **`npx piezas deploy` finds the build itself** and ships the one that uses Piezas: Next standalone output, a server bundle anywhere in the project (a folder whose root has both `server.js` and `package.json`, such as `build/runtime`; it wins over a static `dist/` next to it, which is its browser part), or a static `out/`/`dist/`. If the project's build writes its server bundle somewhere unusual, or deploy reports more than one build, set `deploy.dir` in `piezas.manifest.json` to that folder (a path relative to the project); the owner never needs a flag.
- Server components, route handlers, and server actions are allowed for thin secret handling and UI-specific orchestration.
- Keep business data in Piezas, not local database tables.
- Keep `PIEZAS_API_KEY`, `ADMIN_PASS`, and any auth/session secrets in server-only environment variables.
- API routes should be small adapters around Piezas calls, not a parallel application backend.
- Prefer `createPiezasServerAdapter()` from `@piezas/sdk` for allowlisted proxy routes from the UI to Piezas services.
- If agent tool access is needed, mount `piezasMcp()` from `@piezas/sdk` on a protected POST route and pass authenticated user/tenant context through the request headers.

#### Full Custom Backend

Do not build a full custom backend unless the user explicitly asks for one after being told Piezas should own the backend service layer.

### MCP / Agent Tool Access

Piezas is MCP-ready through `@piezas/sdk`. Do not install or invent a separate MCP package unless the project explicitly requires one.

For a Next.js app with a server runtime:

```typescript
import { piezasMcp } from '@piezas/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = piezasMcp({
  entitiesUrl: process.env.PIEZAS_ENTITIES_URL || 'https://api.piezas.ai/entities',
  pipelineUrl: process.env.PIEZAS_PIPELINE_URL || 'https://api.piezas.ai/pipeline',
  tasksUrl: process.env.PIEZAS_TASKS_URL || 'https://api.piezas.ai/tasks',
});

function requireMcpAccess(req: Request) {
  const hasAppSession = Boolean(req.headers.get('authorization') || req.headers.get('cookie'));
  const hasTenantContext = Boolean(req.headers.get('x-tenant-id') && req.headers.get('x-user-id'));
  if (hasAppSession && hasTenantContext) return null;

  return Response.json(
    { error: 'MCP route requires app auth plus X-Tenant-Id and X-User-Id.' },
    { status: 401 },
  );
}

export async function POST(req: Request) {
  // Replace this guard with your app session/auth check before public use.
  const denied = requireMcpAccess(req);
  if (denied) return denied;

  return handler(req);
}
```

The MCP route exposes approved Piezas-backed entity, pipeline, and task tools to agents. The app still owns route access control, session validation, and tenant/user context. Static deployments cannot safely host MCP because they cannot hold server-only secrets or perform trusted access checks.
<!-- /topic:deploy -->

<!-- topic:entities -->
### Ownership Boundary

The app owns:

- UI and component state
- pages, routes, layouts, and client interactions
- app authentication and session glue
- lightweight API routes for server-side calls, secrets, and UI-specific orchestration only when the chosen deployment mode includes a server runtime
- access control around any app-hosted MCP route
- workflow-specific decisions such as which fields to show, what a booking form asks, and when to call a Piezas service

Piezas owns:

- business records and custom entity schemas
- pipelines, stages, boards, and stage movement
- tasks, assignments, due dates, and checklists
- notifications and message delivery records
- third-party integration connector definitions
- tenant app registry entries, allowed origins, allowed redirect URIs, and app-level integration policy
- app-scoped provider client configuration for separate generated apps/domains/use cases
- user integration connections and encrypted provider tokens
- scoped connection grants for public or organizer-owned workflows
- normalized integration actions and guarded provider proxy calls
- tenant users, invite-only signup, disabled users, public sessions, and audit events
- app end-user accounts, credentials, sessions, and per-app auth policy (the users service)
- durable access logs for service calls across Piezas-backed apps
- durable background jobs and retry state
- normalized integration sync jobs, stale worker lock recovery, and sync cursors
- MCP tool discovery over approved Piezas-backed entity, pipeline, and task tools
- document extraction jobs and e-signature request state
- finance accounts, bills, bank transactions, journal entries, and reconciliation links as entity records
- entity search, bulk import, and JSON/CSV export
- public service records such as bookings, submissions, CRM/intake records, tasks, and workflow state when those records belong to a Piezas service

### Capability Discovery

Before implementing feature logic:

1. Read this file.
2. Read `piezas.manifest.json`.
3. Open the relevant OpenAPI specs.
4. For integrations, inspect available connectors and actions rather than inventing action names.
5. Map each requirement to a Piezas service.
6. Write down any missing capability as a gap before coding around it.

Current normalized provider action-backed connectors include Google Calendar, Gmail, Google Drive, Zoom, HubSpot, DocuSign, QuickBooks, and AWS Textract-compatible proxy connections. Still inspect the connector/action catalog before hardcoding action IDs.

### Install and Initialize

Install:

```bash
npm install @piezas/sdk
```

Initialize:

```typescript
import { Piezas } from '@piezas/sdk';

const piezas = new Piezas({
  apiKey: process.env.PIEZAS_API_KEY,
  entitiesUrl: 'https://api.piezas.ai/entities',
  pipelineUrl: 'https://api.piezas.ai/pipeline',
  tasksUrl: 'https://api.piezas.ai/tasks',
  notificationsUrl: 'https://api.piezas.ai/notify',
  integrationsUrl: 'https://api.piezas.ai/integrations',
  workflowUrl: 'https://api.piezas.ai/workflow',
  calendarUrl: 'https://api.piezas.ai/calendar',
  messagingUrl: 'https://api.piezas.ai/messaging',
  formsUrl: 'https://api.piezas.ai/forms',
  documentsUrl: 'https://api.piezas.ai/documents',
  reportingUrl: 'https://api.piezas.ai/reporting',
  pricingUrl: 'https://api.piezas.ai/pricing',
  discussionUrl: 'https://api.piezas.ai/discussion',
  knowledgeBaseUrl: 'https://api.piezas.ai/knowledge-base',
  adminUrl: 'https://api.piezas.ai/admin',
});
```

The SDK exchanges `sk_live_...` or `sk_test_...` API keys for short-lived service tokens automatically.

### OpenAPI Specs

Read these specs before implementing direct REST calls:

- Entity Records: https://api.piezas.ai/entities/openapi.json
- Pipeline Engine: https://api.piezas.ai/pipeline/openapi.json
- Task Engine: https://api.piezas.ai/tasks/openapi.json
- Notifications: https://api.piezas.ai/notify/openapi.json
- Calendar: https://api.piezas.ai/calendar/openapi.json
- Messaging: https://api.piezas.ai/messaging/openapi.json
- Workflow: https://api.piezas.ai/workflow/openapi.json
- Forms: https://api.piezas.ai/forms/openapi.json
- Documents: https://api.piezas.ai/documents/openapi.json
- Reporting: https://api.piezas.ai/reporting/openapi.json
- Pricing: https://api.piezas.ai/pricing/openapi.json
- Discussion: https://api.piezas.ai/discussion/openapi.json
- Knowledge Base: https://api.piezas.ai/knowledge-base/openapi.json
- Integrations: https://api.piezas.ai/integrations/openapi.json
- Admin/access: https://api.piezas.ai/admin/openapi.json

### SDK Quick Reference

Define business data once, then use generated accessors:

```typescript
await piezas.defineEntities({
  contact: {
    fields: {
      email: { type: 'email', required: true },
      phone: { type: 'phone' },
      status: { type: 'select', options: ['lead', 'active', 'inactive'] },
    },
  },
  booking: {
    fields: {
      startsAt: { type: 'datetime', required: true },
      endsAt: { type: 'datetime', required: true },
      guestEmail: { type: 'email', required: true },
      status: { type: 'select', options: ['confirmed', 'cancelled'] },
    },
  },
});

const contact = await piezas.contacts.create({
  title: 'Jane Smith',
  data: { email: 'jane@example.com', status: 'lead' },
});

const contacts = await piezas.contacts.list({ limit: 50, search: 'jane' });
const searchResults = await piezas.contacts.search({ q: 'jane', limit: 10 });
const csv = await piezas.contacts.exportCsv({ status: 'active' });
await piezas.contacts.update(contact.id, { data: { status: 'active' } });
await piezas.contacts.logActivity(contact.id, {
  type: 'note',
  content: { text: 'Followed up after demo' },
});
```

Define stages and use pipelines for board-style workflows:

```typescript
await piezas.definePipeline('deals', {
  stages: ['New', 'Contacted', 'Proposal', 'Won', 'Lost'],
  winStages: ['Won'],
  lossStages: ['Lost'],
});

const board = await piezas.pipeline('deals').board();
await piezas.pipeline('deals').moveTo(itemId, 'Proposal');
```

Use tasks for assignments and follow-ups:

```typescript
await piezas.tasks.create({
  title: 'Follow up with Jane',
  priority: 'high',
  dueDate: '2026-05-25',
  assigneeId: currentUser.id,
});
```

Use Workflow durable jobs for background work, retries, and deferred processing:

```typescript
const job = await piezas.workflow.enqueueJob({
  type: 'booking.reminder',
  payload: { bookingId },
  runAt: '2026-05-25T16:00:00Z',
  dedupeKey: `booking-reminder:${bookingId}`,
});

const jobs = await piezas.workflow.claimJobs({ workerId: 'worker-1', limit: 10 });

await piezas.workflow.enqueueSyncJob({
  connector: 'gmail',
  connectionId,
  resource: 'messages',
  direction: 'pull',
  cursor: lastCursor,
});

await piezas.workflow.requeueStaleJobs({
  before: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  reason: 'worker lock expired',
});
```

Use Admin/access for invite-only teams, public sessions, and audit events:

```typescript
const invite = await piezas.admin.createTenantInvite(tenantId, {
  email: 'teammate@example.com',
  role: 'member',
});

const publicSession = await piezas.admin.createPublicSession(tenantId, {
  resourceType: 'booking_page',
  resourceId: bookingPageId,
  scopes: ['booking:create'],
  expiresInSeconds: 60 * 60,
});

await piezas.admin.createAuditEvent(tenantId, {
  action: 'booking_page.public_session_created',
  resourceType: 'booking_page',
  resourceId: bookingPageId,
});
```

Use the remaining service clients directly from the same `Piezas` instance:

```typescript
await piezas.messaging.createCampaign({ name: 'Client newsletter' });
await piezas.forms.createForm({ name: 'Client intake' });
await piezas.documents.createDocument({ name: 'Proposal', url: uploadedFileUrl, mimeType });
await piezas.reporting.createDashboard({ name: 'Operations' });
await piezas.pricing.createDocument({ type: 'invoice', title: 'INV-1001' });
await piezas.discussion.createThread({ title: 'Client follow-up' });
await piezas.knowledgeBase.search(collectionId, { query: 'refund policy' });
```

Use finance/accounting pattern helpers before storing records in Entity Records:

```typescript
import {
  createInvoicePosting,
  normalizeFinanceAccount,
  suggestReconciliationMatches,
} from '@piezas/sdk';

const revenue = normalizeFinanceAccount({
  code: '4000',
  name: 'Service Revenue',
  type: 'revenue',
  currency: 'USD',
});

const entry = createInvoicePosting({
  invoiceRef: { type: 'invoice', id: invoiceId },
  amountMinor: 12500,
  currency: 'USD',
  accounts: {
    accountsReceivable: '1200',
    revenue: revenue.code,
  },
});
```

### Platform Contract Rules - Records, Lists, and Jobs

Hard rules learned from production apps. Each one prevents a class of bug that
looks like "the platform is broken" and costs hours to trace. Rule numbers are
stable across the whole contract; they are grouped here by topic.

- **Rule 6 — Lists cap at 100; know your query surfaces.** The `search` param on LIST
  endpoints matches titles only; the dedicated `/search` endpoint
  (`entities.search()`) matches across title, JSON data, and tags — different
  operations, not one behavior. Record lists support `sort`
  (created_at | updated_at | title) + `order` (asc | desc) and a `tag`
  containment filter (servers ≥ 2026-07-26) — use `sort: 'created_at',
  order: 'desc'` for newest-first instead of paging the whole table.
  `data.*` fields are filterable (exact match) but NOT sortable. Never treat
  one list call as "everything" — paginate with `offset` until a short page
  comes back before concluding something does not exist.
- **Rule 10 — The job queue is submit/list/cancel for apps — never a worker host.**
  `workflow.enqueueJob`, `listJobs`, and `cancelJob` work with your API key
  and are scoped to your tenant. `claimJobs`/`completeJob`/`failJob`/
  `requeueStaleJobs` are the platform's worker loop: they return 401 for
  every tenant credential BY DESIGN — do not retry auth variants, request
  role upgrades, or wait for provisioning. For app-side background
  execution, run an in-app executor and use the queue as the durable,
  cancellable record; for platform-side execution use workflow rules.
<!-- /topic:entities -->

<!-- topic:users -->
### App End-User Auth (users service)

The platform provides managed end-user identity per app — accounts, passwords,
email verification, lockout, and ES256-signed sessions. Do not hand-roll any of
it.

- **Server-capable modes**: use `client.users` from `@piezas/sdk` —
  `signUp`/`signIn`/`getSession`/`signOut`/`getMe` plus operator management
  (list/update/import users, `configurePolicy`, `rotatePublishableKey`). The
  service URL comes from `PIEZAS_USERS_URL` (add it to `deploy.requiredEnv`
  when the app signs users in).
- **Static frontend mode**: use `createPublicUsersClient({ baseUrl, appId,
  publishableKey })` — it speaks the publishable-key public path and exposes
  only sign-up, sign-in, forgot-password, and email verification. The
  publishable key IS safe to expose (that is what it is for): mint it once
  server-side/locally with `users.rotatePublishableKey(appId)` and ship it in
  a public env var (`NEXT_PUBLIC_...`/`VITE_...`). Configure the app's
  `allowedOrigins` via `users.configurePolicy` or the browser calls will be
  refused.
- **New accounts land `pending`, not `active` — plan for it.** The default
  policy requires email verification: after `signUp` the account CANNOT sign
  in until the verification flow completes (request → emailed token →
  confirm). A pending account's sign-in with the right password fails with
  `code: 'account_pending'`; a wrong password is `code: 'invalid_credentials'`
  (branch on `error.code`, @piezas/sdk 0.4+). Either implement the verification flow, or — for apps that
  don't want it — call `users.configurePolicy(appId,
  { requireEmailVerification: false })` BEFORE the first sign-up. The policy
  is read at sign-up time: flipping it later does NOT activate
  already-pending users; rescue those with `users.updateUser(appId, userId,
  { status: 'active' })`.
- **Your own reset/verify page needs `returnUrl`**: when the app implements
  its own password-reset or email-verification page, pass that page's full URL
  as `returnUrl` to `users.forgotPassword` / `requestEmailVerification` (the
  service appends `?token=...`), and make sure the app's `allowedOrigins`
  includes that origin (`users.configurePolicy`) — otherwise the request is
  rejected 400 and no email is sent. Omit it and the link points at the
  platform's default page.
- **Sessions**: sign-in returns the session token in the response body — no
  cookie is set. Store it client-side, send it back on your app's
  authenticated calls, and verify it server-side with
  `users.getSession(appId, token)` (rotate to `refreshedToken` when present).
  Per Contract Rule 1, derive `owner_id`/member identity from this verified
  session, never from client-supplied ids.
- **MFA — sign-in is TWO-PHASE, always handle it**: every `signIn` (server or
  public client) may return `{ mfa: { challengeToken, factors } }` INSTEAD of
  a session when the user has a confirmed factor. Your sign-in flow must
  branch on `result.mfa`: prompt for the code (authenticator digits for
  `totp`; the emailed 6-digit code for `email` — it was already sent) and
  call `completeMfaChallenge(challengeToken, code)` to get the real
  `{ user, session }`. Challenges expire in 10 minutes and are single-use.
- **MFA enrollment is platform-provided — never build your own**: offer it in
  the app's security settings via `users.enrollTotp` (render `otpauthUrl` as
  a QR) → `users.confirmTotp(code)`, and/or `users.enableEmailMfa` (needs a
  verified email). `users.disableMfa` requires the current password by
  design. Do NOT store TOTP secrets, recovery codes, or any second-factor
  material in entity records — same rule as passwords (Contract Rule 8).
  The per-app policy knob is `configurePolicy(appId, { mfa })`:
  'optional' (default) challenges enrolled users; 'required' additionally
  signals your app to push enrollment (un-enrolled users still sign in —
  driving them to enroll is YOUR job, the platform will not brick them).

### Sign in with Google or Microsoft (SSO)

Piezas sign-in is email and password (with verification and MFA). For "Sign
in with Google" and/or "Sign in with Microsoft", use `@piezas/sdk/sso`
(server side only). Never write your own OAuth/OIDC code, and never store the
client secrets anywhere but the app's hosting environment variables — never in
code, a committed file, chat, or Piezas Integrations (Integrations are for
using a provider's data, not for signing people in). The owner creates the
Google OAuth client (Google Cloud Console) and/or Microsoft app registration
(Microsoft Entra) and sets the values themselves in the Piezas console → app →
Hosting -> Environment; you give them, in plain words, the exact redirect
URI(s) (`https://<app address>/api/auth/sso/google/callback`,
`https://<app address>/api/auth/sso/microsoft/callback`) and the variable
names: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google;
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID`
(their organization's tenant id or domain, recommended; `organizations` allows
any work or school account) for Microsoft. That is all the owner sets.
`PIEZAS_SSO_SECRET` and `PIEZAS_APP_URL` are optional (advanced): without
`PIEZAS_SSO_SECRET` the SDK derives the sign-in key from the app's
`PIEZAS_API_KEY` (so replacing that key signs SSO users out; they sign in
again), and on Piezas hosting the app's address is known without
`PIEZAS_APP_URL`. Don't list the provider variables in `deploy.requiredEnv`
(list them in `deploy.optionalEnv`, which satisfies doctor and is never
checked at deploy): the app runs without them, and a visitor who tries that sign-in sees a plain
"Sign-in with Google isn't set up yet" message (`sso_error=not_configured`).
Never ask whether the provider variables are set: the deploy compares the
names and, while they are missing, says in one line that Google (or
Microsoft) sign-in stays off until they are set; never ask for the values in
the chat. Ask the owner which provider (or both) and whether to limit sign-in
to their organization's domain, offering the default ("@<their sign-in
domain> only?"); an `allow` rule (`emails`, `domains` or `isAllowed`) is
required. Apps using SSO derive member identity from `getSsoSession` /
`sso.getSession(request)` (verified) per Rule 1, never from anything the
browser sends. Piezas email sign-in remains available alongside. SSO users
are not listed in the console's user list.

```typescript
// lib/sso.ts
import { createSsoRoutes } from '@piezas/sdk/sso';
export const sso = createSsoRoutes({
  providers: { google: {}, microsoft: {} },   // reads the env vars above
  allow: { domains: ['example.com'] },
});
// app/api/auth/sso/[...sso]/route.ts
export const { GET, POST } = sso;
// sign-in links: /api/auth/sso/google/start?returnTo=/dashboard
// sign-out: POST /api/auth/sso/sign-out
```

### Platform Contract Rules - Identity, Sessions, and Credentials

Hard rules learned from production apps. Each one prevents a class of bug that
looks like "the platform is broken" and costs hours to trace. Rule numbers are
stable across the whole contract; they are grouped here by topic.

- **Rule 1 — Per-member isolation is YOUR job.** `owner_id` on calendars (and similar
  fields elsewhere) is attribution plus a filter convention — it is NOT an
  authorization boundary, and API-key tokens carry no acting user. Derive
  `owner_id` from your app session, filter every read by it, and return 404
  for other members' resources. Do not assume the platform enforces it.
- **Rule 5 — Public-session scopes are declared, not yet uniformly enforced.** Never
  ship a public-session token to the browser; verify it server-side and apply
  the scope check in your own adapter.
- **Rule 8 — Credentials live in the users service, nowhere else.** An entity record
  with a `password`/`passwordHash` field is a defect, full stop. Auth flows
  go through `client.users` (server) or `createPublicUsersClient` (browser);
  your records reference users by their users-service id.
<!-- /topic:users -->

<!-- topic:calendar -->
### Calendar

Use Calendar for availability and bookings:

```typescript
const calendar = await piezas.calendar.createCalendar({
  name: 'Team bookings',
  timezone: 'America/Vancouver',
});

await piezas.calendar.createAvailabilityRule({
  calendarId: calendar.id,
  ruleType: 'recurring',
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
});

const slots = await piezas.calendar.getAvailableSlots({
  calendarId: calendar.id,
  dateFrom: '2026-05-25T00:00:00Z',
  dateTo: '2026-05-26T00:00:00Z',
  slotDuration: 30,
});

await piezas.calendar.createBooking({
  calendarId: calendar.id,
  title: 'Intro call',
  startTime: slots[0].start,
  endTime: slots[0].end,
  requireAvailableSlot: true,
});
```

### Platform Contract Rules - Calendar

Hard rules learned from production apps. Each one prevents a class of bug that
looks like "the platform is broken" and costs hours to trace. Rule numbers are
stable across the whole contract; they are grouped here by topic.

- **Rule 2 — Calendar reminders have NO default.** Empty/absent `reminder_offsets_minutes`
  means no reminders ever fire. If your product expects reminders, set it
  explicitly at calendar creation — most apps want `[1440, 60]` (24h + 1h).
- **Rule 3 — Slot duration: pass it explicitly, everywhere you need it.**
  `CalendarSettings.slot_duration_minutes` is stored but never consulted by
  slot computation. The slots endpoint uses its `slot_duration` query param
  (default 30); the booking-time re-check uses `availability.slotDurationMinutes`
  (default: the start/end span). Send the value you mean to both.
- **Rule 4 — Branch on `error.code`, never on error text.** Error strings (e.g. the
  booking 409 messages) are human documentation and may change. Every
  `@piezas/sdk` (0.4+) error carries a stable `code` (`conflict`, `not_found`,
  `validation_failed`, `rate_limited`, ...); HTTP errors also keep `status`. A
  booking 409 (`code: 'conflict'`) = the time is taken → re-fetch slots and
  offer alternatives.
<!-- /topic:calendar -->

<!-- topic:documents -->
### Documents

Use Documents for extraction and e-signature workflow state before provider handoff:

```typescript
const extraction = await piezas.documents.createExtractionJob({
  documentId,
  provider: 'aws_textract',
  requestedFields: ['invoice_number', 'vendor_name', 'total', 'due_date'],
});

const signature = await piezas.documents.createSignatureRequest({
  title: 'Master services agreement',
  documentId,
  provider: 'docusign',
  signers: [{ name: 'Jane Client', email: 'jane@example.com' }],
});
```

Piezas owns the document record, its versions, the extraction job state, and the
e-signature request state. The provider call itself goes through Integrations, so
the app never holds a provider access token or webhook secret for it — store the
Piezas document id, job id, and signature request id as references and read status
back from Piezas.
<!-- /topic:documents -->

<!-- topic:integrations -->
### Integrations Pattern

Integrations are for using a provider's data, never for signing people in. For "Sign in with Google / Microsoft", use `@piezas/sdk/sso` (topic `users`); nothing in Integrations does sign-in.

Use Piezas Integrations for provider data access such as Google Calendar, Zoom, HubSpot, Slack, and similar systems. The app may render connect/status UI, but Piezas owns OAuth client config, callbacks, encrypted provider tokens, refresh, connection status, grants, normalized actions, proxy guardrails, and app-level integration policy.

Piezas integrations are app-scoped when the generated product has its own domain, callback URL, provider client credentials, or permission purpose. Two apps that each use Google Calendar (say, a booking app and a separate staff scheduler) should be separate tenant app records with separate allowed origins, redirect URIs, connector/purpose policy, and provider config. Store the Piezas tenant app slug/id in setup code and pass it as `appId` in SDK calls or `app_id` in REST calls.

Recommended flow:

1. List connectors and available actions.
2. Create or verify the Piezas tenant app through Admin/access with allowed origins, allowed redirect URIs, `authPolicy`, and `integrationPolicy`.
3. Only when the app needs its own branded consent screen for a data connector: save that connector's provider client credentials through Piezas Integrations using `appId` and `purpose`. This never enables sign-in.
4. Start OAuth through Piezas with `appId`, `purpose`, `returnUrl`, and the app user ID.
5. Store returned connection IDs as references.
6. For public or organizer-owned workflows, create a scoped grant and store the grant ID.
7. Prefer `createValidatedConnectionGrant()` so connector action metadata is checked before grant creation.
8. Execute normalized actions first.
9. Use proxy only when no normalized action exists.

```typescript
const connectors = await piezas.integrations.listConnectors();

await piezas.admin.createTenantApp(tenantId, {
  slug: 'booking-portal',
  name: 'Booking portal',
  allowedOrigins: ['https://book.example.com'],
  allowedRedirectUris: ['https://book.example.com/integrations/connected'],
  integrationPolicy: {
    connectors: {
      google_calendar: { purposes: ['calendar_availability'] },
      zoom: { purposes: ['meeting_links'] },
    },
  },
});

const authUrl = await piezas.integrations.getAuthorizationUrl('google_calendar', {
  returnUrl: appReturnUrl,
  userId: currentUser.id,
  appId: 'booking-portal',
  purpose: 'calendar_availability',
});

const connections = await piezas.integrations.listConnections({
  connector: 'google_calendar',
  userId: currentUser.id,
  appId: 'booking-portal',
});

const grant = await piezas.integrations.createValidatedConnectionGrant(connectionId, {
  connector: 'google_calendar',
  label: 'Booking page',
  ownerUserId: currentUser.id,
  actions: ['google_calendar.freebusy', 'google_calendar.events.create'],
});

const freeBusy = await piezas.integrations.grantAction(
  grant.id,
  'google_calendar.freebusy',
  {
    timeMin: '2026-05-20T09:00:00Z',
    timeMax: '2026-05-20T17:00:00Z',
    items: [{ id: 'primary' }],
  }
);
```

### Platform Contract Rules - Webhooks and Notifications

Hard rules learned from production apps. Each one prevents a class of bug that
looks like "the platform is broken" and costs hours to trace. Rule numbers are
stable across the whole contract; they are grouped here by topic.

- **Rule 7 — Webhooks: verify signature AND freshness, then dedupe.** The SDK's
  `webhookHandler` does signature + a 5-minute replay window by default
  (requires `webhookSecret` — it fails closed without one). For exactly-once
  side effects, also dedupe on the envelope `id`.
- **Rule 9 — Notifications are transactional, not bulk.** One recipient per send —
  confirmations, resets, alerts, reminders. Do NOT loop `notify.send()`
  over a mailing list (newsletters, campaigns, blasts): there is no batch
  endpoint and none is planned — Piezas is not an email service. When the
  product needs bulk email, integrate a commercial sender (Mailgun,
  SendGrid, Postmark) directly in the app; per-send sender identity and
  open/delivery analytics belong to that sender too.
<!-- /topic:integrations -->

<!-- topic:patterns -->
### Thin Server Adapter Pattern

For static frontends with a small BFF/Lambda/API route layer, use the SDK server adapter instead of writing an open proxy. The adapter exchanges the Piezas API key server-side, allowlists service/path/method combinations, strips caller auth, and forwards only safe headers.

```typescript
import { createPiezasServerAdapter } from '@piezas/sdk';

const adapter = createPiezasServerAdapter({
  apiKey: process.env.PIEZAS_API_KEY!,
  rules: [
    { service: 'entities', methods: ['GET', 'POST'], path: /^\/v1\/records/ },
    { service: 'calendar', method: 'GET', path: '/v1/availability/slots' },
  ],
});

export async function POST(request: Request) {
  return adapter.handle(request, { service: 'entities', path: '/v1/records' });
}
```

Do not expose a generic path parameter like `/api/piezas/[...path]` unless every target is checked against a narrow allowlist.

### Report a Problem Button

Every app with a server gets a small "Report a problem" button in the bottom-left corner. Anyone using the app can drag it out of the way or click it to say what went wrong. It is on every screen, including the sign-in screen, and never depends on being signed in; the smoke test checks it is visible on the first screen before anyone signs in. Each report carries a screenshot of what the person saw (they can leave it out), the page address without its query string or fragment (those can hold private details), the window size, and the page's last errors and failed requests. The button stays on the page even when the app crashes. Reports are saved in the app's own records (entity `problem_reports`, status `new`), screenshots in the app's own Documents.

Each report also says who sent it, worked out by the app's server and never taken from the browser: the signed-in account when the app uses Piezas sign-in; otherwise an optional name or email the person types, marked as not verified. Apps with their own sign-in pass `identify` to `createReportProblemRoute` (it returns the signed-in person's `{ id, email, name }` from the app's own session, or null).

When the owner asks to pull or fix the reported problems: run `npx piezas reports --save` (each report goes to `.piezas/reports/<id>.md` and `<id>.jpg`); for each one, look at the screenshot first, then read the report; fix it and test the fix; then run `npx piezas reports --done <id>` for each fixed one (several: `--done <id>,<id>`). A report keeps showing until it is marked done, so never mark one done without a fix. Then redeploy.

`piezas init`, the start of the build and `piezas test` add the button to a Next.js app themselves (`piezas report-button add` does it on demand); a deploy of a server app without it (doctor PZ027) stops for you first: run `piezas report-button add`, rebuild, deploy again. Only if that did not work does it reach the owner, inside the one pause. Always add the button; never remove it from the code to turn it off. On or off is never asked: a deploy keeps the app's setting (a first deploy: on; a value set in the console is never overwritten), and the app reads the hosted setting `PIEZAS_REPORT_BUTTON` at run time. Only when the owner asks to change it: `piezas report-button on|off` (or `report_button` on `piezas_deploy`).

```tsx
// app/api/piezas/report/route.ts
import { Piezas, createReportProblemRoute } from '@piezas/sdk';
const piezas = new Piezas({ apiKey: process.env.PIEZAS_API_KEY! });
export const { GET, POST } = createReportProblemRoute({ piezas });
```

```tsx
// app/report-problem.tsx
'use client';
import { mountReportProblem } from '@piezas/sdk/report-problem';
// Mounted when this file loads, outside React, so the button outlives a crash.
if (typeof window !== 'undefined') mountReportProblem();
export function ReportProblem() {
  return null;
}
// app/layout.tsx: render <ReportProblem /> once inside <body>.
```

Other frameworks: call `mountReportProblem()` once in the browser and serve the route's `GET` and `POST` at `/api/piezas/report` (pass `{ endpoint }` if the route differs). Static-only apps have no server to save reports, so they do not get the button.

### OpenAPI Fallback Pattern

Use SDK clients first. If a less common endpoint is not yet wrapped or you need to verify exact request/response details, read the service OpenAPI spec and call Piezas from server-side code. If you need a bearer token for direct REST, use the exported token provider:

```typescript
import { ApiKeyTokenProvider } from '@piezas/sdk';

const tokenProvider = new ApiKeyTokenProvider(
  process.env.PIEZAS_API_KEY!,
  'https://api.piezas.ai/admin'
);

const token = await tokenProvider.getToken();

const res = await fetch('https://api.piezas.ai/calendar/v1/bookings', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(input),
  cache: 'no-store',
});
```

### Public Booking / Intake Pattern

For a public booking, appointment, intake, or CRM lead-capture app:

- Entity Records: contacts, companies, leads, event types, organizer profiles, booking pages, invitee answers, booking references
- Calendar SDK/API: availability rules, booking records, blocked times, time windows
- Integrations: Google Calendar free/busy, Google Calendar event creation, Zoom meeting creation, and other provider actions when connectors expose them
- Notifications: booking confirmations, reminders, cancellations, reschedules
- Forms: custom invitee questions when the workflow needs reusable form definitions
- Tasks: internal follow-ups after high-value bookings
- Pipeline: CRM lead/opportunity stages when public submissions should become tracked sales or support work

Do not store Google/Zoom/Outlook tokens in the generated app. Store only Piezas connection IDs and grant IDs.
Store public visitor input as Piezas CRM/intake records, not only as UI-local state or unstructured booking notes.
Use the tenant app `appId` on connection and grant references so bookings, audit events, and access logs can be filtered by the generated app that owns the workflow.

Recommended UX sequence:

1. Team member signs up or signs in.
2. Team member connects Google Calendar before creating event types if external free/busy is required.
3. Team member optionally connects Zoom or another meeting provider.
4. Team member creates event types with duration, location mode, availability windows, work days, timezone, buffers, notice window, rolling date range, and custom questions.
5. Public visitor opens `/book/{slug}` or `/book/{team}/{event}`.
6. Visitor sees dates and slots in their local timezone.
7. Visitor answers custom questions and confirms.
8. App creates the booking through Piezas and uses Integrations to create external calendar/meeting artifacts when enabled.
9. Notifications send confirmation, cancellation, reschedule, and reminder messages.

Admin/team management:

- Use the Admin/access SDK/API for team members, roles, invite codes, disabled users, public sessions, and audit events.
- Use Piezas-backed records for app-specific organizer profiles, allowed domains, and UI preferences.
- Static-only apps must not use an `ADMIN_PASS` in browser code. If the user asks for `ADMIN_PASS`, require a server runtime/BFF or use a Piezas-hosted/admin-controlled mechanism.
- Admin pages should disable/kick users through the Admin/access API, not by deleting local database rows.

Static deployment warning:

- A public booking app can be static only if all booking, availability, auth, and integration calls can be made safely through browser-safe Piezas/public endpoints.
- If the app needs server-only token exchange or private admin secrets, use Amplify SSR/Next runtime or a small API layer. Do not silently add Next.js API routes to a static export app.

### Recipe Manifest Pattern

If `piezas.manifest.json` contains `recipes`, treat those recipes as requirements, not decoration. Each recipe declares which Piezas services own the backend state, which UI layer the app owns, and the expected setup order. Before coding, map the user's prompt to those recipe entries and reuse their service list.

Known recipe presets from the CLI:

- `booking-site`: public booking, availability, invitee questions, calendar/meeting integrations, reminders, and audit events
- `crm-project-finance`: contacts, deals, projects, tasks, invoices/receipts, ledger entries, documents, and reports
- `client-services-os`: client portal, cases/projects, tasks, documents, discussion, forms, appointments, and knowledge base

Do not create local product tables for a recipe-owned object unless the manifest explicitly moves ownership to the app.

### Small Business Operations Pattern

For booking, CRM, project/case tracking, invoicing, receipts, reconciliation, client documents, and basic reporting:

- Entity Records: contacts, companies, projects/cases, invoices, receipts, accounting accounts, journal entries, reconciliation links, signature requests, extraction jobs
- Pricing: catalog items, quotes, invoice-like documents, and line items
- Documents: uploaded invoices, receipts, contracts, signed files, and version history
- Tasks/Workflow: approval steps, reminders, reconciliation review queues, extraction jobs, report refreshes
- Reporting: sales, bookings, receivables, project status, and reconciliation dashboards
- Integrations: payment links/references, OCR or document extraction providers, e-signature providers, accounting exports, Gmail/Outlook sending, HubSpot import/export

Do not implement payment processing inside the generated app. Use provider integrations for payment links, checkout URLs, payout/status references, or accounting exports. Piezas stores the business records and provider references; the payment provider moves money.

For reconciliation, use SDK helpers such as `suggestReconciliationMatches()` and `createReconciliationLink()` before writing reconciliation records to Entity Records. For double-entry logic, use `assertBalancedJournalEntry()` before posting ledger entries.

For e-signature and invoice extraction, store request/job state in Piezas records and use Integrations for the provider call. Do not store provider access tokens or webhook secrets in the generated app.

### CRM Pattern

For a CRM:

- Entity Records: contacts, companies, deals, activities, notes, custom fields
- Pipeline: deal stages and board views
- Tasks: follow-ups, reminders, assignments
- Notifications/Messaging: outbound emails and sequence steps
- Integrations: provider-owned connections such as HubSpot, Gmail, or calendar providers when needed

### Project Tracker Pattern

For a project tracker:

- Entity Records: projects, issues, labels, releases, teams
- Pipeline: board columns such as Backlog, In Progress, Review, Done
- Tasks: assigned work and checklists
- Discussion: comments and threads
- Reporting: status dashboards and snapshots
<!-- /topic:patterns -->
