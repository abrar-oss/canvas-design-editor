# Canvas Design Editor — port notes

The prototype (`Designer.html` + `src/*.jsx` loaded via CDN React + in-browser
Babel) has been ported to a real **Vite + React 18** app with a build step and
ES modules. The prototype `.jsx` files are preserved as the behavior spec — only
the *delivery mechanism* changed.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle -> dist/
```

## What changed vs. the prototype

- **No CDN / no in-browser Babel.** React/ReactDOM come from npm; JSX is
  transpiled at build time by esbuild (`@vitejs/plugin-react`, automatic JSX
  runtime). Entry is `src/main.jsx` → `index.html`.
- **`window.*` module exports → real `import`/`export`.** Every component and
  helper (`Icon`, `utils.*`, `renderShape`/`Rulers`, `Chrome`/`TopBar`,
  `LeftPanel`, `Canvas`, `ToolDock`, `RightPanel`, `App`) is now a proper ES
  module export, imported by name.
- **Runtime service singletons kept on `window` (by design).** A small set of
  cross-cutting runtime services remain on a single global namespace, matching
  the architecture the README describes (e.g. it explicitly says the canvas
  layer provides a global `window.measureText(...)` for the layout engine):
  - `window.LayoutEngine` / `window.computeAutoLayoutEngine` — the geometry
    engine instance (published by `layoutEngine.jsx`, imported for side effects
    in `main.jsx`).
  - `window.measureText` / `window.__textMeasurer` — text-measurement service +
    its cached offscreen measuring node (from `rightPanel.jsx`).
  - `window.ensureFont` / `window.EFFECT_DEFAULTS` — font loader + effect
    presets (from `rightPanel.jsx`).
  - `window.__textLiveUpdate` / `window.__designerClipboard` — live text-edit
    callback channel and the in-memory clipboard (set by `canvas.jsx`).

  These are genuine late-bound app singletons, not module exports; converting
  them to static imports would force the layout engine to import the entire
  inspector. They could be moved into a tiny shared `runtime.js` module later if
  full purity is desired.

## Module dependency order

`icons → utils → layoutEngine → shapes → {chrome, leftPanel, tools} → canvas →
rightPanel → app`. `main.jsx` imports the CSS, side-effect-imports
`layoutEngine.jsx`, then renders `<App/>`.

## Styling

`colors_and_type.css` (tokens, both themes) and `src/styles.css` (app chrome)
are ported verbatim. Inter is self-hosted from `fonts/`; Geist / JetBrains Mono
/ Outfit load from Google Fonts (the `@import` was moved to the top of
`colors_and_type.css` to satisfy the CSS spec / bundler).

## Follow-ups (not done)

- TypeScript types for the `Doc`/`Node`/`Paint` model (README lists TS as
  recommended; the port stays in JSX to preserve behavior 1:1 first).
- Optional: relocate the `window.*` runtime singletons into a `runtime.js`.
