# Fieldwise

Smart farm monitor demo for Willow Creek Farm. One map-first screen shows every field, sensor reading, weather cue and recommended action so a farmer can decide what to water without hunting through menus.

Built for the Piezas hackathon as a **mock-first** frontend: all readings, forecasts and alerts are simulated. No real sensors or weather service are connected yet.

## Features

- **Map-first board** — 2D and interactive 3D farm map with crop rows, woodland, rivers, hills, barn and irrigation lines
- **Per-field detail** — soil moisture (including variation by sensor area), humidity, soil temp, last watering, pH and salinity
- **Floating cards** — farm overview, weather, alerts, recommended actions and farmer profile; each card minimizes
- **Adjust farm** — drag parcels to match a real layout; **Standard layout** restores the default
- **Fields & sensors** — readings, history charts and watering log in one place
- **Demo crops** — wheat, canola, barley, oats, alfalfa and blueberries (with acidic soil targets)

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Sign in before the map:

| Farmer | Email | Password | Fields |
| --- | --- | --- | --- |
| Sam Whitfield | `sam@willowcreekfarm.ca` | `farm123` | North Wheat, East Canola, South Barley |
| Jordan Hale | `jordan@mapleridge.ca` | `oats456` | West Oats, Creek Alfalfa, Blueberry Hill |

Auth is **mock** for the demo (local session). Piezas email/password users can replace it later.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local Vite server with hot reload |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |

## Stack

- Vite + TypeScript (vanilla, no UI framework)
- [three.js](https://threejs.org/) for the 3D map
- Simulated sensor week in `src/seed/`
- Prepared for Piezas (`@piezas/sdk`) when backend wiring starts

## Project layout

```
src/
  main.ts          App shell, dock, panels, actions
  state.ts         Session state (selection, cards, layout offsets)
  seed/            Farm seed data and deterministic simulation
  views/           Map (2D/3D), cards, pages
  ui/              Icons, charts, helpers
  styles.css       Theme and board layout
```

## Notes

- Branch for this UI work: `front-end`
- Layout offsets and watering log persist in `localStorage` (`fw-off`, `fw-log`, `fw-cards`)
- Piezas ownership rules still apply: no local business DB, no API keys in the browser; this milestone stays on seed data until a `SPEC.md` and scenarios are approved

## License

Private hackathon project.
