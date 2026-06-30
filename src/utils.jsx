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

// CSS background-image value for a single paint. Wrapping solids in a
// 2-stop gradient lets them stack with other paints via `background:
// img1, img2, ...`.
function paintBg(p) {
  if (!p || p.visible === false) return null;
  const op = p.opacity ?? 1;
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

// First visible paint, useful for swatches & single-color readouts.
function firstVisibleFill(n) {
  return fillsOf(n).find(p => p && p.visible !== false) || null;
}

// Representative color (hex) for a paint — picks first stop for gradients.
// Used for things like the "selection colors" badges.
function paintRepColor(p) {
  if (!p) return null;
  if (p.type === "solid") return p.color;
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
  fillsOf, fillsPatch, paintBg, fillsCss, firstVisibleFill, paintRepColor,
  DEFAULT_LINEAR, DEFAULT_RADIAL,
  penPathD, penBounds,
};
