# Web application

The React/TypeScript application is the runnable OpenKartLine workspace. It uses an accessible SVG editor so canonical geometry stays in meters and remains independent of screen pixels.

## Run

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Vite serves `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:8000`. If the API is unavailable, the UI stays usable through the deterministic browser fallback and labels that mode explicitly.

## Current capabilities

- Three synthetic presets and a closed centerline editor.
- Point drag/add/remove, pan, zoom, fit, undo, and redo.
- Kart, driver, grip, braking, and solver inputs with visible bounds.
- `.okl.json` local import/export.
- API adapter from centerline/width input to explicit boundaries.
- Browser point-mass fallback.
- SVG racing-line and distance-chart visualization.
- Stale-result, loading, invalid-input, fallback, and success states.

## Verify

```bash
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

Build GitHub Pages with `VITE_BASE_PATH=/openkartline/`. The static demo cannot host the Python service and therefore uses the browser fallback; clone the repository to use the scientific engine.
