import React from "react";
/* global React, ReactDOM, Icon */
const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

// ============================================================
// Utilities
// ============================================================
const uid = (() => { let n = 0; return () => `n${Date.now().toString(36)}_${(n++).toString(36)}`; })();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 0) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };
const isFrame = n => n && n.type === "frame";
const rand = (a, b) => a + Math.random() * (b - a);

const DEFAULT_FILL = { type: "solid", color: "#D9D9D9", opacity: 1 };
const DEFAULT_STROKE = null; // { color, weight, opacity }

const SHAPE_DEFAULTS = {
  frame:    { w: 1440, h: 900,  fill: { type: "solid", color: "#FFFFFF", opacity: 1 }, radius: 0, name: "Frame" },
  rect:     { w: 200,  h: 140,  fill: DEFAULT_FILL, radius: 0, name: "Rectangle" },
  ellipse:  { w: 160,  h: 160,  fill: DEFAULT_FILL, name: "Ellipse" },
  line:     { w: 200,  h: 0,    stroke: { color: "#171717", weight: 2, opacity: 1 }, name: "Line" },
  polygon:  { w: 160,  h: 160,  fill: DEFAULT_FILL, sides: 6, name: "Polygon" },
  star:     { w: 160,  h: 160,  fill: DEFAULT_FILL, points: 5, innerRatio: 0.4, name: "Star" },
  text:     { w: 220,  h: 40,   fill: { type: "solid", color: "#000000", opacity: 1 },
              text: "Type something", fontFamily: "Inter", fontSize: 16, fontWeight: 400,
              lineHeightUnit: "auto",
              // Sizing modes: "auto-wh" (hug both, single-line — default),
              // "auto-h" (fixed width, wraps & hugs height), "fixed" (both
              // locked, text may overflow). User can switch in the inspector.
              sizingMode: "auto-wh",
              align: "left", name: "Text" },
  image:    { w: 280,  h: 200,  fill: DEFAULT_FILL, name: "Image" },
  pen:      { w: 200,  h: 100,  stroke: { color: "#171717", weight: 2, opacity: 1 }, fill: null, name: "Vector", points: [] },
  comment:  { w: 24,   h: 24,   name: "Comment", text: "" },
};

// ============================================================
// Doc store (pages with top-level children)
// ============================================================
function makeInitialDoc() {
  return {
    pages: [
      { id: uid(), name: "Page 1", children: [] },
    ],
    activePageId: null,
  };
}

// ============================================================
// Context
// ============================================================
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

// ============================================================
// History — per-key past/future stacks so each tab has its own
// undo timeline. The hook is given the active key (e.g. tabId)
// and operates on `state[key]` instead of the whole state map.
// ============================================================
function useHistory(activeKey, state, setState) {
  const stacks = useRef({}); // { [key]: { past: [], future: [] } }
  const lastSnap = useRef(null); // { key, json } — pending snapshot

  const getStack = (key) => {
    if (!stacks.current[key]) stacks.current[key] = { past: [], future: [] };
    return stacks.current[key];
  };

  const snapshot = useCallback(() => {
    lastSnap.current = { key: activeKey, json: JSON.stringify(state[activeKey]) };
  }, [activeKey, state]);

  const commit = useCallback(() => {
    if (lastSnap.current !== null) {
      const { key, json } = lastSnap.current;
      const s = getStack(key);
      s.past.push(json);
      if (s.past.length > 50) s.past.shift();
      s.future = [];
      lastSnap.current = null;
    }
  }, []);

  const undo = useCallback(() => {
    const s = getStack(activeKey);
    if (!s.past.length) return;
    s.future.push(JSON.stringify(state[activeKey]));
    const prev = s.past.pop();
    setState(d => ({ ...d, [activeKey]: JSON.parse(prev) }));
  }, [activeKey, state, setState]);

  const redo = useCallback(() => {
    const s = getStack(activeKey);
    if (!s.future.length) return;
    s.past.push(JSON.stringify(state[activeKey]));
    const next = s.future.pop();
    setState(d => ({ ...d, [activeKey]: JSON.parse(next) }));
  }, [activeKey, state, setState]);

  // Drop a key's stacks entirely — call this when a tab is closed so its
  // history doesn't leak.
  const dropKey = useCallback((key) => {
    delete stacks.current[key];
  }, []);

  // Coalesce rapid same-source mutations into a single undo entry:
  //   history.beginTransient("text:" + nodeId);  // snapshot ONCE
  //   ... mutate state repeatedly ...
  //   (auto-commits 500ms after the last beginTransient call with same key)
  //
  // Use for typing into inputs, arrow-key nudges, scrubber drags — anywhere
  // you'd otherwise produce one undo entry per keystroke/pixel.
  const transientKey = useRef(null);
  const transientTimer = useRef(null);
  const beginTransient = useCallback((key) => {
    if (transientKey.current !== key) {
      // Different source than last time — commit the previous transient
      // (if any) before starting a new one.
      if (transientTimer.current) {
        clearTimeout(transientTimer.current);
        commit();
      }
      transientKey.current = key;
      snapshot();
    }
    if (transientTimer.current) clearTimeout(transientTimer.current);
    transientTimer.current = setTimeout(() => {
      commit();
      transientKey.current = null;
      transientTimer.current = null;
    }, 500);
  }, [snapshot, commit]);

  return { snapshot, commit, undo, redo, dropKey, beginTransient };
}

// ============================================================
// Auto layout
// ============================================================
// Resolve a frame's padding to per-side values {t,r,b,l}. Frames store
// either a symmetric paddingX/paddingY pair, or — when paddingIndividual is
// on — four explicit sides.
function resolvePadding(n) {
  if (n && n.paddingIndividual) {
    return {
      t: n.paddingTop ?? 16, r: n.paddingRight ?? 16,
      b: n.paddingBottom ?? 16, l: n.paddingLeft ?? 16,
    };
  }
  const px = n?.paddingX ?? 16, py = n?.paddingY ?? 16;
  return { t: py, r: px, b: py, l: px };
}

// The single source of truth for auto-layout positioning. Returns a map of
// childId -> { x, y } in coords RELATIVE to the parent frame, honoring:
//   - direction (row / column)
//   - gap + spacingMode ("packed" | "space-between")
//   - primaryAlign / counterAlign ("start" | "center" | "end")
//   - per-side padding (resolvePadding)
// Used by the canvas renderer, the selection-chrome position resolver, and
// the bake-on-disable path so all three stay perfectly in sync.
function computeAutoLayout(parent, kids) {
  if (!parent || parent.type !== "frame" || !parent.autoLayout) return null;
  const isRow = parent.direction !== "column";
  const gap = parent.gap ?? 10;
  const pad = resolvePadding(parent);
  const primary = parent.primaryAlign || "start";
  const counter = parent.counterAlign || "start";
  const spaceBetween = parent.spacingMode === "space-between";
  const list = kids || [];
  const n = list.length;

  // Primary axis = the flow axis; counter axis = across it.
  const primaryStart = isRow ? pad.l : pad.t;
  const primaryRoom  = (isRow ? parent.w : parent.h) - (isRow ? pad.l + pad.r : pad.t + pad.b);
  const counterStart = isRow ? pad.t : pad.l;
  const counterRoom  = (isRow ? parent.h : parent.w) - (isRow ? pad.t + pad.b : pad.l + pad.r);

  const primaryOf = k => (isRow ? k.w : k.h);
  const counterOf = k => (isRow ? k.h : k.w);
  const totalPrimary = list.reduce((a, k) => a + primaryOf(k), 0);

  let effGap = gap;
  let cursor = primaryStart;
  if (spaceBetween && n > 1) {
    effGap = (primaryRoom - totalPrimary) / (n - 1);
  } else {
    const free = primaryRoom - (totalPrimary + gap * Math.max(0, n - 1));
    if (primary === "center") cursor += free / 2;
    else if (primary === "end") cursor += free;
  }

  const out = {};
  list.forEach(k => {
    let off = 0;
    const cs = counterOf(k);
    if (counter === "center") off = (counterRoom - cs) / 2;
    else if (counter === "end") off = counterRoom - cs;
    const counterPos = counterStart + off;
    out[k.id] = isRow ? { x: cursor, y: counterPos } : { x: counterPos, y: cursor };
    cursor += primaryOf(k) + effGap;
  });
  return out;
}

// ============================================================
// Color helpers
// ============================================================
function hexToRgba(hex, a = 1) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function fillCss(fill) {
  // Single-paint helper, still used for strokes / shadows / legacy reads.
  if (!fill) return "transparent";
  if (fill.visible === false) return "transparent";
  if (fill.type === "solid") return hexToRgba(fill.color, fill.opacity);
  // Gradient as single value → render as background-image string.
  return paintBg(fill) || "transparent";
}

// Always returns an array of paints for a node. Falls back to wrapping the
// legacy `n.fill` field so old documents still load.
function fillsOf(n) {
  if (!n) return [];
  if (Array.isArray(n.fills)) return n.fills;
  if (n.fill) return [n.fill];
  return [];
}

// Build a patch that updates BOTH `fills` (new array form) and `fill`
// (legacy mirror = first paint). Pass this to `update()` to keep them in
// sync so any code still reading n.fill continues to work.
function fillsPatch(arr) {
  return { fills: arr, fill: arr[0] || null };
}

// Defaults for a `pattern` paint. Kept here so the picker, the renderer and
// any document migration agree on the shape.
const PATTERN_DEFAULTS = {
  kind: "dots",        // dots | stripes | grid | checks | crosshatch | image
  color: "#111111",    // foreground (ink)
  bg: "#FFFFFF",       // background (paper); "transparent" is allowed
  scale: 16,           // tile size in px
  angle: 45,           // rotation, degrees (stripes / crosshatch / image tile)
  src: null,           // image tile source (kind === "image")
};

// CSS `background` LAYERS for a pattern paint. Returns a full shorthand layer
// list (`<image> <position> / <size> <repeat>`) so a pattern can span several
// images (a grid needs one gradient per axis) while still travelling through
// the single-string pipeline that solids/gradients use.
function patternLayers(p) {
  const d = { ...PATTERN_DEFAULTS, ...p };
  const op = p.opacity ?? 1;
  const s = Math.max(2, d.scale || 16);
  const ink = d.color === "transparent" ? "transparent" : hexToRgba(d.color, op);
  const paper = !d.bg || d.bg === "transparent" ? "transparent" : hexToRgba(d.bg, op);
  const tile = `0 0 / ${s}px ${s}px repeat`;
  // Paper sits behind every kind — emitted last (CSS paints layers front-to-back).
  const paperLayer = paper === "transparent" ? null : `linear-gradient(${paper}, ${paper})`;
  const out = [];

  if (d.kind === "image") {
    if (!d.src) return [];
    // Tiled image: `scale` is the tile edge. Angle is not expressible on a
    // background layer, so image tiles ignore it (the picker hides the field).
    out.push(`url("${d.src}") ${tile}`);
    if (paperLayer) out.push(paperLayer);
    return out;
  }
  if (d.kind === "dots") {
    const r = Math.max(1, s * 0.18);
    out.push(`radial-gradient(circle at 50% 50%, ${ink} ${r}px, transparent ${r + 0.5}px) ${tile}`);
  } else if (d.kind === "stripes") {
    const w = s / 2;
    out.push(`repeating-linear-gradient(${d.angle}deg, ${ink} 0 ${w}px, transparent ${w}px ${s}px)`);
  } else if (d.kind === "grid") {
    const t = Math.max(1, Math.round(s * 0.06));
    out.push(`linear-gradient(90deg, ${ink} 0 ${t}px, transparent ${t}px) ${tile}`);
    out.push(`linear-gradient(0deg, ${ink} 0 ${t}px, transparent ${t}px) ${tile}`);
  } else if (d.kind === "checks") {
    out.push(`repeating-conic-gradient(${ink} 0% 25%, transparent 0% 50%) ${tile}`);
  } else if (d.kind === "crosshatch") {
    const t = Math.max(1, Math.round(s * 0.06));
    out.push(`repeating-linear-gradient(${d.angle}deg, ${ink} 0 ${t}px, transparent ${t}px ${s}px)`);
    out.push(`repeating-linear-gradient(${d.angle + 90}deg, ${ink} 0 ${t}px, transparent ${t}px ${s}px)`);
  }
  if (paperLayer) out.push(paperLayer);
  return out;
}

// CSS `background` value for a single paint — one or more comma-separated
// shorthand layers. Wrapping solids in a 2-stop gradient lets them stack with
// other paints via `background: layer1, layer2, ...`.
function paintBg(p) {
  if (!p || p.visible === false) return null;
  const op = p.opacity ?? 1;
  if (p.type === "image") {
    if (!p.src) return null;
    const size = p.fit === "contain" ? "contain" : p.fit === "tile" ? "auto" : "cover";
    const repeat = p.fit === "tile" ? "repeat" : "no-repeat";
    return `url("${p.src}") center / ${size} ${repeat}`;
  }
  if (p.type === "pattern") {
    const layers = patternLayers(p);
    return layers.length ? layers.join(", ") : null;
  }
  if (p.type === "solid") {
    const c = hexToRgba(p.color, op);
    return `linear-gradient(${c}, ${c})`;
  }
  if (p.type === "linear") {
    const stops = (p.stops || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(s =>
      `${hexToRgba(s.color, (s.opacity ?? 1) * op)} ${((s.position ?? 0) * 100).toFixed(2)}%`
    ).join(", ");
    return `linear-gradient(${p.angle ?? 180}deg, ${stops})`;
  }
  if (p.type === "radial") {
    const stops = (p.stops || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(s =>
      `${hexToRgba(s.color, (s.opacity ?? 1) * op)} ${((s.position ?? 0) * 100).toFixed(2)}%`
    ).join(", ");
    return `radial-gradient(circle at center, ${stops})`;
  }
  return null;
}

// Stacked `background` value for a node (multi-fill aware). First visible
// paint sits ON TOP — last is furthest back.
function fillsCss(n) {
  const arr = fillsOf(n).filter(p => p && p.visible !== false).map(paintBg).filter(Boolean);
  return arr.length ? arr.join(", ") : "transparent";
}

// Full background style object for a node's fills. Every paint now emits a
// complete `background` shorthand layer (image/pattern layers carry their own
// position/size/repeat), so this is a thin wrapper over fillsCss().
function fillsStyle(n) {
  return { background: fillsCss(n) };
}

// First visible paint, useful for swatches & single-color readouts.
function firstVisibleFill(n) {
  return fillsOf(n).find(p => p && p.visible !== false) || null;
}

// Representative color (hex) for a paint — picks first stop for gradients and
// the ink color for patterns. Used for things like the "selection colors" badges.
function paintRepColor(p) {
  if (!p) return null;
  if (p.type === "solid") return p.color;
  if (p.type === "pattern") return p.color || PATTERN_DEFAULTS.color;
  const s = (p.stops || [])[0];
  return s ? s.color : null;
}

// Default new paints used when adding to the fill list.
const DEFAULT_LINEAR = {
  type: "linear", angle: 180, opacity: 1, visible: true,
  stops: [
    { color: "#FFFFFF", opacity: 1, position: 0 },
    { color: "#000000", opacity: 1, position: 1 },
  ],
};
const DEFAULT_RADIAL = {
  type: "radial", opacity: 1, visible: true,
  stops: [
    { color: "#FFFFFF", opacity: 1, position: 0 },
    { color: "#000000", opacity: 1, position: 1 },
  ],
};
const DEFAULT_PATTERN = { type: "pattern", ...PATTERN_DEFAULTS, opacity: 1, visible: true };

// Resolve a text node's line-height to a CSS-ready value.
// - lineHeightUnit "auto" → "normal" (browser auto, scales with font size)
// - lineHeightUnit "px"   → pixel string ("24px")
// - lineHeightUnit "%"    → unitless multiplier (1.2 for 120%)
// - legacy (no unit set)  → unitless multiplier (the raw number) or "normal"
function lineHeightCss(node) {
  const v = node?.lineHeight;
  const u = node?.lineHeightUnit;
  if (u === "auto") return "normal";
  if (u === "px") return ((v ?? 24)) + "px";
  if (u === "%")  return (v ?? 120) / 100;
  return v ?? "normal";
}

// ============================================================
// Vector / pen path helpers
// ============================================================
// A pen point is { x, y, hIn?:{x,y}, hOut?:{x,y} } where hIn/hOut are control
// handle offsets RELATIVE to the anchor. No handles = a sharp corner; a pair of
// mirrored handles = a smooth point. A segment falls back to a straight line
// when NEITHER adjoining handle exists, so legacy straight-line vectors (and
// corner-to-corner runs) still render correctly.
function penSeg(a, b) {
  const c1 = a.hOut ? { x: a.x + a.hOut.x, y: a.y + a.hOut.y } : null;
  const c2 = b.hIn ? { x: b.x + b.hIn.x, y: b.y + b.hIn.y } : null;
  if (!c1 && !c2) return `L ${b.x} ${b.y}`;
  const cc1 = c1 || { x: a.x, y: a.y };
  const cc2 = c2 || { x: b.x, y: b.y };
  return `C ${cc1.x} ${cc1.y} ${cc2.x} ${cc2.y} ${b.x} ${b.y}`;
}

// Build the SVG path `d` for a pen node's points.
function penPathD(points, closed) {
  const pts = points || [];
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += " " + penSeg(pts[i - 1], pts[i]);
  if (closed) d += " " + penSeg(pts[pts.length - 1], pts[0]) + " Z";
  return d;
}

// Bounding box of a pen path. Includes anchors AND their handle endpoints —
// a cubic Bézier is contained within the convex hull of its control points, so
// this is a safe (slightly generous) bound that never clips the curve.
function penBounds(points) {
  const xs = [], ys = [];
  (points || []).forEach(p => {
    xs.push(p.x); ys.push(p.y);
    if (p.hIn)  { xs.push(p.x + p.hIn.x);  ys.push(p.y + p.hIn.y); }
    if (p.hOut) { xs.push(p.x + p.hOut.x); ys.push(p.y + p.hOut.y); }
  });
  if (!xs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// ============================================================
// Export globals for other scripts
// ============================================================
export {
  uid, clamp, round, isFrame, rand,
  DEFAULT_FILL, DEFAULT_STROKE, SHAPE_DEFAULTS,
  makeInitialDoc, AppCtx, useApp, useHistory,
  resolvePadding, computeAutoLayout,
  hexToRgba, fillCss, lineHeightCss,
  fillsOf, fillsPatch, paintBg, fillsCss, fillsStyle, firstVisibleFill, paintRepColor,
  DEFAULT_LINEAR, DEFAULT_RADIAL, DEFAULT_PATTERN, PATTERN_DEFAULTS, patternLayers,
  penPathD, penBounds,
};
