# Fieldwise

Smart farm monitor for wheat, canola, barley, oats, alfalfa and blueberries. One map-first screen shows every field, sensor reading, weather cue and recommended action.

Accounts, farms and fields are served by the API on `backend/platform` (see `docs/api.md`). Map readings stay simulated until sensors land.

## Quick start

```bash
npx piezas init          # writes .env (needs Piezas org access)
npm run dev:api          # API on http://localhost:8787 (after merge with backend/platform)
npm run dev              # Vite UI; proxies /api → :8787
```

Open the URL Vite prints (usually `http://localhost:5173`). Sign in before the map:

| Farmer | Email | Password | Fields |
| --- | --- | --- | --- |
| Sam Whitfield | `sam@willowcreekfarm.ca` | `farm123-demo` | North Wheat, East Canola, South Barley |
| Jordan Hale | `jordan@mapleridge.ca` | `oats456-demo` | West Oats, Creek Alfalfa, Blueberry Hill |

Session is an httpOnly cookie (`piezas_session`). Sign-up is on the same screen. New farms need latitude and longitude for weather.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite + `/api` proxy to localhost:8787 |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |

## Stack

- Vite + TypeScript (vanilla)
- [three.js](https://threejs.org/) for the 3D map
- Cookie session against `/api/auth/*`
- Simulated sensor week in `src/seed/` until ingest is wired

## Notes

- Branch for this UI work: `front-end`
- Keep `SPEC.md` from `backend/platform` when merging
- Scenario tests: S-019 sign-in, S-020 wrong password, S-011 own fields, S-021 sign-out, S-022 add/remove field
- Layout offsets and watering log still use `localStorage` (`fw-off`, `fw-log`, `fw-cards`) — not the session
- Never put `PIEZAS_API_KEY` in browser code

## License

Private hackathon project.
