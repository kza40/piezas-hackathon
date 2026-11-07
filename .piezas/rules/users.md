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
