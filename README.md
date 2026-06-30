# Handoff: Figma-Style Design Editor ("Canvas")

## Overview
This is a browser-based **vector design editor** in the spirit of Figma — a canvas
workspace where a user creates frames (artboards), draws shapes, types text, arranges
elements with a constraint-based **Auto Layout** engine, and edits everything through a
left layers panel and a right properties inspector. It supports multiple open files
(tabs), pages within a file, pan/zoom, rulers + guides, light/dark theme, per-file
undo/redo, and a Figma-grade color picker with solid/linear/radial paints.

It is a single-page application. There is no backend — all document state lives in React
memory (per-tab). The goal of the handoff is to recreate this editor inside a real
production codebase.

---

## About the Design Files
The files in this bundle are a **working HTML/React prototype** — they run, but they are
provided as a **design + behavior reference**, not as production code to copy verbatim.
They were authored as a self-contained artifact: React + Babel are loaded from a CDN and
JSX is transpiled in the browser at runtime. That is fine for a prototype but is **not**
how you should ship this.

**Your task:** recreate this editor in the target codebase's real environment — a proper
React (or Vue/Svelte/etc.) app with a build step (Vite, Next, etc.), real ES modules,
TypeScript if available, and the team's established state-management and component
patterns. Treat the prototype's `.jsx` files as the **specification of intended behavior
and structure**: the data model, the auto-layout algorithm, the interaction logic, and
the exact visual styling are all real and should be preserved. The *delivery mechanism*
(in-browser Babel, global `window` exports, `<script type="text/babel">`) should be
replaced with the codebase's normal module system.

If no codebase exists yet, scaffold a fresh **Vite + React + TypeScript** app and port the
modules into it (one module → one file, `window.X` exports → real `import`/`export`).

---

## Fidelity
**High-fidelity (hifi).** This is a pixel-accurate, fully-styled, fully-interactive
prototype with final colors, typography, spacing, iconography, and behavior. Recreate the
UI faithfully. The styling lives in two stylesheets you should port as-is (or convert into
the codebase's styling system — CSS modules, Tailwind, styled-components — while keeping
the same token values):
- `colors_and_type.css` — design tokens (color scales, semantic tokens, type scale,
  spacing, radii, shadows, motion) for light + dark themes.
- `src/styles.css` — all the application chrome styling (panels, toolbar, canvas,
  inspector, color picker, etc.). ~2000 lines, heavily commented.

---

## Tech Stack (prototype → target)
| Concern | Prototype | Recommended target |
|---|---|---|
| Framework | React 18.3.1 (UMD, CDN) | React 18+ via Vite/Next |
| JSX transform | Babel Standalone, in-browser | Build-time (esbuild/swc) |
| Module sharing | `Object.assign(window, {...})` | ES `import`/`export` |
| Language | JS (JSX) | TypeScript (recommended) |
| State | `useState` in `App` + React Context (`AppCtx`) | Keep Context, or move doc to a store (Zustand/Redux) — see notes |
| Styling | Two global CSS files w/ CSS variables | Port tokens; keep CSS variables for theming |
| Fonts | Inter (local `.ttf`), JetBrains Mono / Geist / Outfit (Google Fonts) | Self-host or use the team's font pipeline |
| Icons | Inline SVG components in `src/icons.jsx` | Port to the codebase's icon system |

> **State-management note:** the prototype keeps the entire document in `App`'s
> `useState` and threads everything through one big Context value (`ctxValue` in
> `src/app.jsx`). It works because of React structural sharing (the layout engine relies
> on object identity for caching — see below). If you move to an external store, **preserve
> immutable updates with structural sharing**: a mutation must create new object refs only
> for the changed node and its ancestors, leaving siblings referentially equal. The layout
> engine's incremental caching depends on this.

---

## The Data Model (most important section)

A **document** (`doc`) is per-tab and shaped like:
```ts
type Doc = {
  pages: Page[];
  activePageId: string | null;
};
type Page = {
  id: string;
  name: string;          // "Page 1"
  children: Node[];      // FLAT list of all nodes on the page (not nested!)
};
```

### Nodes are a flat list with parent pointers
This is the single most important architectural decision. **Nodes are NOT stored as a
nested tree.** `page.children` is a flat array; hierarchy is expressed by each node's
`parentId`. Root-level nodes have `parentId == null` (treated as parent `"__root__"`).
The tree is rebuilt on demand by indexing `parentId` (see `buildIndex` in
`layoutEngine.jsx` and the `byParent`/`byId` memo in `leftPanel.jsx`).

```ts
type Node = {
  id: string;                 // uid() — e.g. "n_lz4f8_3"
  type: "frame" | "rect" | "ellipse" | "line" | "polygon"
      | "star" | "text" | "image" | "pen" | "comment";
  parentId: string | null;    // hierarchy
  name: string;               // "Frame 2", auto-numbered per type
  x: number; y: number;       // position (WORLD coords for root nodes)
  w: number; h: number;       // size
  rotation?: number;          // degrees
  hidden?: boolean;           // visibility toggle (excluded from layout flow)
  locked?: boolean;
  opacity?: number;           // 0..1, whole-node opacity
  radius?: number;            // corner radius (rect/frame)

  // ---- Paint (fills) ----
  fills?: Paint[];            // NEW multi-paint array form (source of truth)
  fill?: Paint | null;        // LEGACY single-paint mirror = fills[0]. Keep in sync!
  stroke?: { color: string; weight: number; opacity: number } | null;

  // ---- Effects ----
  effects?: Effect[];         // shadows / blurs

  // ---- Text nodes ----
  text?: string;
  fontFamily?: string;        // "Inter"
  fontSize?: number;          // 16
  fontWeight?: number;        // 400
  lineHeight?: number;
  lineHeightUnit?: "auto" | "px" | "%";
  letterSpacing?: number;
  textCase?: "upper" | "lower" | "title" | undefined;
  paragraphSpacing?: number;
  align?: "left" | "center" | "right";
  sizingMode?: "auto-wh" | "auto-h" | "fixed";  // text box sizing

  // ---- Auto Layout (frames only) ----
  autoLayout?: boolean;       // is this frame an auto-layout container?
  direction?: "row" | "column";
  gap?: number;
  spacingMode?: "packed" | "space-between";
  primaryAlign?: "start" | "center" | "end";   // main-axis
  counterAlign?: "start" | "center" | "end";    // cross-axis
  paddingX?: number; paddingY?: number;         // symmetric padding
  paddingIndividual?: boolean;                  // use 4 explicit sides instead
  paddingTop?: number; paddingRight?: number;
  paddingBottom?: number; paddingLeft?: number;

  // ---- Auto Layout (children of an AL frame) ----
  layoutSizingH?: "fixed" | "hug" | "fill";     // horizontal sizing
  layoutSizingV?: "fixed" | "hug" | "fill";     // vertical sizing
  layoutPositioning?: "auto" | "absolute";      // opt out of flow

  // ---- Vector / pen ----
  points?: PenPoint[];        // { x, y, hIn?:{x,y}, hOut?:{x,y} }
  closed?: boolean;

  // ---- Polygon / star ----
  sides?: number;             // polygon
  points_count?: number;      // star points (see SHAPE_DEFAULTS.star.points)
  innerRatio?: number;        // star

  // ---- Image ----
  src?: string;
};

type Paint =
  | { type: "solid"; color: string; opacity: number; visible?: boolean }
  | { type: "linear"; angle: number; opacity: number; visible?: boolean; stops: Stop[] }
  | { type: "radial"; opacity: number; visible?: boolean; stops: Stop[] };
type Stop = { color: string; opacity: number; position: number }; // position 0..1
```

**Per-type defaults** live in `SHAPE_DEFAULTS` (`src/utils.jsx`) — width/height, default
fill, default text properties, etc. Use them when creating new nodes.

**Legacy `fill` vs new `fills`:** the editor migrated from a single `fill` to a `fills[]`
array. Always read via the `fillsOf(node)` helper (returns the array, falling back to
wrapping the legacy `fill`). Always write via `fillsPatch(arr)` which sets both `fills`
*and* `fill = arr[0]` so older read paths keep working. In a fresh build you may drop the
legacy field, but then update all readers.

---

## The Auto Layout Engine (`src/layoutEngine.jsx`) — port this carefully
This is the algorithmic heart of the app and the file most worth reading line by line. It
resolves the **rendered geometry** (`x, y, w, h` in world coordinates) of every node from
the flat node list, and is the single source of truth for: the canvas renderer, selection
chrome / hit-testing / snapping, and the inspector's resolved W/H readouts.

It implements Figma's full constraint model:
- **Hug Contents** — a frame sizes to its children + padding
- **Fill Container** — a child grows to consume free space on an axis
- **Fixed** — explicit width/height
- **Nested Auto Layout** — resolves bottom-up (measure) then top-down (arrange)
- **Space Between** — distributes free space as gaps
- **Padding** — symmetric or per-side
- **Alignment** — primary + counter axis (start/center/end)
- **Absolute position** — a child opts out of flow via `layoutPositioning: "absolute"`

**Two-pass algorithm:**
1. `measure(node)` (bottom-up): the node's *natural* size before any parent stretches it.
   Hug frames compute from children; text measures its wrapped intrinsic size.
2. `arrange(node, x, y, w, h)` (top-down): given a final placement, resolve and position
   all children, then recurse.

`resolve(children)` returns `{ geom, index }` where `geom` is a `Map<id, {x,y,w,h}>`.

**Performance design you should preserve:** the engine uses a `WeakMap` `measureCache`
keyed by the node **object**, recording the exact child object references used. On lookup
it verifies those refs are unchanged — so a mutation only invalidates the changed node and
its ancestors, not siblings or unrelated subtrees. "Object identity is the dirty bit."
There's also a `textCache` memoizing DOM text measurement (the most expensive per-node op).
This is why immutable structural-sharing updates matter (see state note above). Text
measurement calls a global `window.measureText(...)` provided by the canvas layer — wire
up the equivalent in your build.

---

## Screens / Views (single screen, composed of regions)

The app is one full-viewport screen. Top-level layout (`src/app.jsx` → `Chrome` →
`body-area`):

```
┌──────────────────────────────────────────────────────────────┐
│ os-titlebar:  ● ● ●   [ Tab1 ][ Tab2 ] +                       │  36px, macOS chrome
├──────────────────────────────────────────────────────────────┤
│ topbar (optional/secondary)                                    │  44px
├───────────┬──────────────────────────────────────┬───────────┤
│ LeftPanel │            Canvas (flex:1)            │ RightPanel│
│  248px    │   rulers · frames · shapes · guides   │   260px   │
│           │                                        │           │
│  layers   │        ┌───────────────────┐           │ inspector │
│  /pages   │        │  bottom ToolDock  │           │  tabs +   │
│           │        └───────────────────┘           │  sections │
└───────────┴──────────────────────────────────────┴───────────┘
```

### 1. Window chrome + Tabs (`src/chrome.jsx`)
- macOS title bar, 36px tall, `--app-chrome` background, 1px bottom border.
- Traffic lights: three 12px circles, gap 8px — red `#ff5f57`, yellow `#febc2e`,
  green `#28c840`.
- **Tabs** = open files. Each tab 28px tall, radius `6px 6px 0 0`, min-width 100px /
  max-width 180px, ellipsized name. Active tab uses `--tab-active`. Close (×) button
  appears on hover/active; the last remaining tab cannot be closed. A `+` button (28px)
  adds a new untitled file. Each tab owns its own doc, selection, history timeline.

### 2. Left Panel (`src/leftPanel.jsx`, 248px, right border)
- **Header (`lp-head`):** app logo (30px) + editable file name (14px / weight 650).
  Double-click / click to rename inline.
- **Tab row:** "File" / "Assets" pills + a search toggle (search box appears when on).
- **Layers tree:** the flat node list rendered as a hierarchy via `parentId`. Each row
  (`.layer`, 28px) shows: expand caret (frames), type icon (16px), name (ellipsized),
  and hover actions. Frame rows get a faint accent tint (`.is-frame`). Selected rows use
  `--accent-soft` text/background. Full **drag-and-drop reordering & reparenting** with
  drop-line indicators (`before`/`after`) and drop-inside highlight (`inside`). Search
  filters the tree.
- **Pages list:** pages within the file; click to switch active page, hover to reveal a
  delete button, double-click to rename inline (`.page-rename-input`).

### 3. Canvas (`src/canvas.jsx`, flex:1 — the largest/most complex module, ~2350 lines)
- Infinite pannable / zoomable surface. `--canvas-bg` background (theme + Tweak driven).
- **Transform model:** `pan {x,y}` + `zoom` (1 = 100%). A `.canvas-world` div is
  `transform: translate(panX,panY) scale(zoom)`; `--zoom` CSS var is set on it so chrome
  (frame shadows, etc.) can inverse-scale to stay ~1px.
- **Rulers** (`.ruler-h` / `.ruler-v`, 24px) along top + left, toggled by the `showRulers`
  Tweak and `Shift+R`. Drag from a ruler to create a **guide** (red `#FF3B30` line).
- **Frames** (`.frame`) = artboards: white box, subtle zoom-compensated shadow, a
  screen-space **label** above (single-click select, double-click rename) rendered outside
  the scaled world so it stays crisp and unclipped.
- **Shapes** rendered via `renderShape` (`src/shapes.jsx`).
- **Selection chrome** (`.selection-overlay`): 1px accent outline + 8px square resize
  handles (corners + midpoints), circular rotate handles, a monospace **size badge**
  (`WxH`, accent bg), marquee select (`.marquee`), zoom marquee, and pink **snap lines**
  (`#ff3b7a`) when edges align while dragging.
- **Selection context (Figma-style "enter" behavior):** `selCtx` holds the id of the
  frame currently being edited; clicking selects nodes whose parent === `selCtx`
  (`null` = page root). Double-click to descend into a frame.
- **Inline text editing:** `FigmaTextEditor` (`src/shapes.jsx`) uses a `contentEditable`
  div for native cursor/selection, reporting `{text,w,h}` live so the node grows as you
  type; commits on blur/Escape.
- Cursors change per active tool (crosshair for shape tools, custom SVG nib for pen, text
  caret, magnifier for zoom, grab/grabbing for hand/pan).

### 4. Bottom Tool Dock (`src/tools.jsx`)
Floating pill centered at the bottom (`.tool-dock`), 32px buttons, active tool gets accent
background. Tools (`TOOLS` array) with shortcuts:
- **V** Move/Select · **F** Frame · **Shape group** (flyout: **R** Rectangle, **O**
  Ellipse, **L** Line, Polygon, Star) · **P** Pen · **T** Text · **I** Image · **H** Hand ·
  **C** Comment.
The shape entry is a group button with a caret that opens a flyout menu; the group button
mirrors whichever shape was last used.

### 5. Right Panel — Inspector (`src/rightPanel.jsx`, 260px, ~3550 lines)
`scrollbar-gutter: stable` so width never wobbles. Contents are contextual to the
selection.
- **Header (`rp-header`, 52px):** user avatar (gradient), Present button, accent Share
  pill.
- **Tab row (`rp-tabs-row`, 44px):** "Design" / "Prototype" tabs + a zoom dropdown
  (`rp-zoom`, fit/50/100/200/etc.).
- **Design tab sections** (each `.insp-section` with an 11px uppercase-ish header):
  - **Align** — 6-button align grid (`.align-pill`, 3-col).
  - **Position** — X / Y inputs + rotation input + transform actions (flip etc.).
  - **Layout (size)** — W / H with a Fixed/Hug/Fill menu per axis (`.size-field` +
    `sizing-menu-btn`), plus text-box sizing pill (Auto W / Auto H / Fixed).
  - **Auto Layout** (`.al-panel`) — only for frames: direction toggle (row/column), the
    **3×3 alignment matrix** (`.al-grid` with `.al-dot`s and preview bars), gap input
    (with a spacing menu: packed / space-between), padding (symmetric or the 2×2
    individual-sides grid), and advanced options (`al-tune` menu). Children of an AL frame
    get Fill/Hug/Fixed sizing controls + an absolute-position toggle (`.al-abs-toggle`).
  - **Fill** — multi-paint list (`.paint-row` / `.fill-row`): swatch + hex + opacity %,
    eye (visibility) + remove buttons, empty-state add row. Opens the color picker.
  - **Stroke** — color + weight; supports per-side via the cross-layout
    `.individual-sides-grid` with a center link/unlink button.
  - **Effects** — shadows / blurs via a custom icon dropdown (`.effects-type-*`).
  - **Typography** (text nodes) — family, size, weight, line-height (with unit toggle
    auto/px/%), letter-spacing, case, paragraph spacing, alignment.
  - **Selection colors** — aggregated swatches across the selection.

### 6. Color Picker (`.cp-popover`, in `src/rightPanel.jsx` styles)
A full Figma-style picker, 264px wide:
- Paint-type pill: **Solid / Linear / Radial**.
- 168px **saturation/value** square with a draggable handle.
- **Hue** + **alpha** sliders (10px rails, circular handles), plus an **eyedropper**
  button.
- HEX / RGB / HSL fields with a mode dropdown.
- **Gradient editing:** a stops bar (`.cp-stops-bar`) — click to add a stop, drag stops,
  an explicit stops list with swatch/hex/position/remove, and a circular **angle knob**
  (`.cp-angle-knob` with rotating needle) for linear gradients.
- **Favorite swatches** grid (8-col) with add/remove.

### 7. Tweaks Panel (`Tweaks` in `src/app.jsx`)
A small floating panel (host-driven; opens via the `__activate_edit_mode` postMessage
protocol). Default tweak keys (`TWEAK_DEFAULTS`): `showRulers` (bool), `canvasBg` (light
canvas color), `canvasBgDark` (dark canvas color), each with curated swatches + hex input.
*This is an authoring-host integration; a production build likely drops it or replaces it
with real app settings.*

---

## Interactions & Behavior

### Tools & creation
- Selecting a shape/frame/text/image tool sets the cursor to crosshair; **drag on the
  canvas** to create a node of that type at that rect (falls back to `SHAPE_DEFAULTS`
  size on click). New nodes are auto-named per type via `nextAutoName` ("Frame", "Frame
  1", "Frame 2"… filling gaps from deletions).
- **Pen tool:** click to place anchors, drag to pull Bézier handles; builds a `points[]`
  vector path. Path math in `penPathD` / `penSeg` / `penBounds` (`src/utils.jsx`).
- **Text tool:** click/drag then type in the contentEditable editor; sizing modes
  auto-wh (hug both, single line) / auto-h (fixed width, wraps + hugs height) / fixed.
- **Frame tool:** creates an artboard; dropping nodes inside re-parents them.

### Selection & manipulation
- Click to select; Shift-click to multi-select; marquee-drag on empty canvas.
- Drag selection to move; drag handles to resize (corner = both axes, mid = one axis);
  rotate handle to rotate. **Snapping** to sibling/parent edges shows pink snap lines.
- Double-click a frame to "enter" it (`selCtx`), so subsequent clicks select its children.
- Reorder/reparent in the layers tree via drag-and-drop (before / after / inside).

### Auto layout authoring
- Toggle a frame to auto-layout; set direction, gap, padding, alignment via the inspector.
- Set each child's H/V sizing to Fixed / Hug / Fill; toggle a child to absolute to remove
  it from flow. The engine recomputes geometry live (see engine section).

### Keyboard
- **Tool shortcuts:** V F R O L P T I H C (see Tool Dock).
- **Shift+R** toggles rulers (matches Figma).
- Inputs ignore global shortcuts while focused (guards on INPUT/TEXTAREA/contentEditable).
- Number inputs accept **arithmetic expressions** ("300-10", "300 + 5*2") and
  **drag-to-scrub** (`NumInput` / `evalNumeric` in `src/rightPanel.jsx`).

### Undo / Redo (`useHistory` in `src/utils.jsx`)
- **Per-tab** past/future stacks (each file has its own timeline; capped at 50 entries).
- Snapshots are `JSON.stringify` of the active doc.
- `beginTransient(key)` coalesces rapid same-source mutations (typing, arrow-nudges,
  scrubbing) into a single undo entry, auto-committing 500ms after the last call.
- Closing a tab drops its history (`dropKey`).

### Theme
- Light / dark via `data-theme` on `<html>`; toggled in app state. Both stylesheets define
  a full dark token set. Canvas background per theme is Tweak-controlled.

---

## State Management (summary)
All in `src/app.jsx` `App` component, provided through `AppCtx`:
- `tabs`, `activeTabId`, `fileNames` — open files.
- `docs` — `{ [tabId]: Doc }` (each tab's document).
- `selections`, `selCtxs` — per-tab selection + selection-context.
- `tool`, `mode` ("design"/"prototype"), `theme`, `pan`, `zoom`.
- `tweaks`, `showTweaksPanel`.
- `history` — `useHistory(activeTabId, docs, setDocs)`.
- Derived `ctxValue` object passed to every component via Context. Components read it with
  `useApp()`.

Transitions: tool selection → cursor + canvas creation mode; selection changes → inspector
contents; doc mutations → `setDoc` (immutable, structural sharing) → layout engine
recompute → canvas re-render.

---

## Design Tokens
Full token set is in **`colors_and_type.css`** (port verbatim). Highlights:

**App accent (from `src/styles.css`):** `--accent: #1D4ED8` (blue, light) / `#3b82f6`
(dark); `--accent-soft: rgba(29,78,216,0.15)`.

**Neutral scale (primary palette):** `#fafafa #f5f5f5 #e5e5e5 #d4d4d4 #a3a3a3 #737373
#525252 #404040 #262626 #171717 #0a0a0a`.

**Semantic accents:** teal `#0d9488`, orange `#ea580c`, sky `#0284c7`, red `#dc2626`,
green `#16a34a`, amber `#d97706`.

**App chrome (light):** bg `#f5f5f5`, chrome `#fafafa`, panel `#ffffff`, border `#e5e5e5`,
fg `#171717` / `#525252` / `#a3a3a3`, canvas `#e5e5e5`. Dark equivalents defined under
`[data-theme="dark"]`.

**Traffic lights:** `#ff5f57 / #febc2e / #28c840`. **Guides:** `#FF3B30`. **Snap lines:**
`#ff3b7a`.

**Type:** Inter (sans/display, local variable font), JetBrains Mono (mono), Geist + Outfit
also loaded. Scale (px / line-height): xs 12/16, sm 14/20, base 16/22, lg 18/24, xl 20/26,
2xl 24/32, 3xl 30/36, 4xl 36/40, 5xl 48/52, 6xl 60/64; display-lg 72, display-xl 100.

**Spacing (4px base):** 0 4 8 12 16 20 24 32 40 48 64.

**Radii:** xs 2, sm 6, md 8, lg 10, xl 14, 2xl 20, full 9999. **UI-specific:** chip 4,
ctrl 6, surface 8, floating 10.

**UI control heights:** sm 24, md 28 (default), lg 32 (tool dock), row 28.

**Shadows:** 2xs→2xl Tailwind-style set (see file). Toolbar shadow:
`0 6px 20px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)`.

**Motion:** durations fast 120ms / med 200ms / slow 320ms; easing
`--ease-out: cubic-bezier(.16,1,.3,1)`, `--ease-in-out: cubic-bezier(.65,0,.35,1)`,
`--ease-standard: cubic-bezier(.4,0,.2,1)`.

---

## Assets
- **Fonts:** `fonts/Inter-VariableFont.ttf`, `fonts/Inter-Italic-VariableFont.ttf` (local).
  JetBrains Mono / Geist / Outfit pulled from Google Fonts (`@import` in
  `colors_and_type.css`).
- **Icons:** all inline SVG React components in `src/icons.jsx` — no external icon lib.
- No raster images are part of the UI itself (the `image` node type lets *users* place
  images at runtime). The project's `screenshots/` and `uploads/` folders are authoring
  artifacts and are **not** needed to implement the design.

---

## Files in this bundle
The design lives in `Designer.html` + the `src/` modules. Load order (from
`Designer.html`) reflects dependencies:

1. `src/icons.jsx` — inline SVG icon components (`Icon.*`).
2. `src/utils.jsx` — data model, `SHAPE_DEFAULTS`, `makeInitialDoc`, `AppCtx`/`useApp`,
   `useHistory`, color + paint helpers, auto-layout helpers, pen-path helpers. Exports to
   `window`.
3. `src/layoutEngine.jsx` — the Auto Layout geometry engine (`window.LayoutEngine`).
4. `src/shapes.jsx` — `renderShape` + the `FigmaTextEditor` (contentEditable text editing).
5. `src/chrome.jsx` — macOS window shell, tabs, topbar.
6. `src/leftPanel.jsx` — layers tree (drag/drop reparent) + pages.
7. `src/canvas.jsx` — the canvas: pan/zoom, rulers/guides, rendering, selection chrome,
   hit-testing, snapping, creation, marquee. (Largest module.)
8. `src/tools.jsx` — bottom tool dock + shape flyout.
9. `src/rightPanel.jsx` — the inspector (position/size/auto-layout/fill/stroke/effects/
   typography) + the color picker + `NumInput`/`evalNumeric`. (Largest module.)
10. `src/app.jsx` — `App` root: per-tab state, Context wiring, Tweaks, keyboard, theme.

Styling: `colors_and_type.css` (tokens) + `src/styles.css` (app chrome).

> Reminder: `window.X` exports between these files are an artifact of the in-browser-Babel
> setup. In the target build, convert them to real `import`/`export`. The split above is a
> sensible module boundary to keep.

---

## Suggested implementation order
1. **Scaffold** the app (Vite + React + TS) and port both CSS files / tokens + theming.
2. **Data model + store** (`utils.jsx`): node types, `SHAPE_DEFAULTS`, doc/page structure,
   immutable update helpers with structural sharing, color/paint helpers. Add TS types.
3. **Layout engine** (`layoutEngine.jsx`) with its caches + a `measureText` implementation.
   Unit-test it against the Figma behaviors (hug/fill/space-between/nesting/absolute).
4. **Canvas render + transform** (pan/zoom, frames, `renderShape`) — read-only first.
5. **Selection + manipulation** (chrome, handles, move/resize/rotate, snapping, marquee).
6. **Tools + creation** (tool dock, drag-to-create, pen, text editing).
7. **Left panel** (layers tree w/ DnD reparent, pages).
8. **Right panel inspector** + **color picker**.
9. **Tabs / multi-file**, **undo/redo**, **theme**, keyboard shortcuts.
10. Polish: rulers/guides, transient history coalescing, arithmetic number inputs.
