# Acceptance scenarios

One file per acceptance scenario in `SPEC.md`, named for the scenario it
proves: `S-001-add-a-contact.spec.ts` (or `S-001.spec.ts`) tests `### S-001`,
and nothing else. `npx piezas test` creates a failing placeholder for every
scenario that has no file yet; replace its body, and keep its first line
(`// piezas-scenario: S-001 v=...`): it records which wording of the scenario the
test was written for, so a changed scenario reads as "out of date", not broken.

Write each test from the scenario's own Given/When/Then: the Given is the data
(`scripts/seed.ts` puts made-up records into the TEST copy of the app), the
When is the interaction (`page.goto`, then click / fill / ...), the Then is a
check on what is visible (`await expect(page.getByTestId('...')).toBeVisible()`).

`npx piezas test` rejects a test that never opens the app, never does what the
When line says, checks nothing visible, has a check that is always true, is
skipped (`test.skip` / `.only` / `.fixme`), swallows failures, or fakes Piezas
(intercepting its requests, mocking the SDK). Such a test counts as not written.

Once a test passes, its checks are recorded. Removing or loosening one later
needs the owner's OK (`npx piezas test` reports "changed checks").

**Select by `data-testid`.** Text and CSS selectors break on the next redesign;
a test id survives copy changes, restyling and layout moves. Add `data-testid`
to the elements a scenario drives, name it for the thing
(`data-testid="cancel-booking"`), and select it with
`page.getByTestId('cancel-booking')`. `npx piezas doctor` counts the interactive
elements that still have none (PZ026).
