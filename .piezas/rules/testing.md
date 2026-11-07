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
