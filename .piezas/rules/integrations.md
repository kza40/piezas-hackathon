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
