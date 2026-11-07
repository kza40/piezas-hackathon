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
