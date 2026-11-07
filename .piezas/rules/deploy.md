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
