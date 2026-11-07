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
