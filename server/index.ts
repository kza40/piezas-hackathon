// Starts the app: /api/* from server/app.ts, everything else from the built frontend (dist/).
//   development:  npm run dev:api  (uses the TEST Piezas app; the Vite dev server proxies /api here)
//   production:   npm run build && npm start
import './use-test-app'; // first: picks the test app's key when started with --test-app
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { api } from './app';

const app = new Hono();
app.route('/', api);
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' })); // single-page app: unknown paths load the app

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Fieldwise server on http://localhost:${port}`));
