import { lineHeightCss } from "./utils.jsx";
/* global React */
// ============================================================
// Auto Layout engine — Figma-grade, built for scale.
// ============================================================
//
// This module resolves the *rendered geometry* (x, y, w, h in WORLD
// coordinates) of every node in a page from the flat node list. It is the
// single source of truth consumed by:
//   - the canvas renderer (positions + sizes)
//   - selection chrome / hit-testing / snapping (effective bounds)
//   - the inspector (resolved W/H readouts for hug/fill nodes)
//
// It implements the full constraint-based flexbox model used by Figma Auto
// Layout:
//   • Hug Contents      — a frame sizes itself to its children (+padding)
//   • Fill Container     — a child grows to consume free space on an axis
//   • Fixed              — explicit width/height
//   • Nested Auto Layout — frames inside frames resolve bottom-up then top-down
//   • Space Between      — distribute free space as gaps
//   • Padding            — per-side or symmetric
//   • Alignment          — primary + counter axis (start/center/end)
//   • Absolute position  — a child opts OUT of flow (layoutPositioning)
//
// PERFORMANCE
// -----------
// The store uses React structural sharing: a setDoc that touches one node
// recreates *only* that node object (and its array), leaving every untouched
// node at the same object reference. We exploit that for genuine incremental
// recalculation:
//
//   • measureCache  — a WeakMap keyed by the node OBJECT. The cached entry
//     records the exact child-object references it was computed from. On
//     lookup we verify those references are unchanged; if so it's a hit. A
//     mutation therefore only invalidates the changed node and its ANCESTORS
//     (whose child-reference list now differs) — siblings and unrelated
//     subtrees stay cached. This is dirty-node tracking without a manual
//     dirty flag: object identity *is* the dirty bit.
//
//   • textCache     — memoizes the DOM text-measurement (the single most
//     expensive per-node op) by a style+content key, so re-layouts never
//     re-measure unchanged strings.
//
//   • resolve()     — memoized by the children-array reference, so the many
//     consumers in one React render share ONE layout pass (batched).
//
// The result: a mutation in a 10k-node document re-measures O(depth) nodes,
// not O(n); a full cold pass is a single linear sweep.
// ============================================================

(function () {
  "use strict";

  // ---- Sizing accessors (with safe back-compat defaults) ----
  // Unset sizing === "fixed" so documents authored before this engine keep
  // their exact dimensions. Hug/Fill are strictly opt-in.
  const HUG = "hug", FILL = "fill", FIXED = "fixed";
  const isAL = (n) => n && n.type === "frame" && !!n.autoLayout;
  const isAbsolute = (n) => n && n.layoutPositioning === "absolute";

  function sizingH(n) {
    if (!n) return FIXED;
    if (n.layoutSizingH) return n.layoutSizingH;
    return FIXED;
  }
  function sizingV(n) {
    if (!n) return FIXED;
    if (n.layoutSizingV) return n.layoutSizingV;
    return FIXED;
  }

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

  // ============================================================
  // Text intrinsic measurement (memoized)
  // ============================================================
  const textCache = new Map();
  const TEXT_CACHE_CAP = 4000;
  function measureTextIntrinsic(n, maxWidth) {
    const paraGap = n.paragraphSpacing || 0;
    const key = [
      n.text || "", n.fontFamily || "Inter", n.fontSize || 16, n.fontWeight || 400,
      n.lineHeight ?? "", n.lineHeightUnit ?? "", n.letterSpacing ?? "",
      n.textCase ?? "", paraGap, maxWidth == null ? "_" : Math.round(maxWidth),
    ].join("|");
    const hit = textCache.get(key);
    if (hit) return hit;
    let out;
    if (typeof window.measureText === "function") {
      const tt = n.textCase === "upper" ? "uppercase"
               : n.textCase === "lower" ? "lowercase"
               : n.textCase === "title" ? "capitalize" : "none";
      out = window.measureText(n.text || "", {
        fontFamily: n.fontFamily, fontSize: n.fontSize, fontWeight: n.fontWeight,
        lineHeight: lineHeightCss ? lineHeightCss(n) : 1.25,
        letterSpacing: n.letterSpacing, maxWidth, textTransform: tt,
      });
      // The read-only renderer adds paragraph spacing as margin between
      // hard-break-separated paragraphs; measureText doesn't, so add it here
      // or the box (and any hugging frame) won't grow with the spacing.
      if (paraGap > 0 && n.text) {
        const paraCount = (n.text.match(/\n/g) || []).length;
        out = { w: out.w, h: out.h + paraCount * paraGap };
      }
    } else {
      out = { w: n.w, h: n.h };
    }
    if (textCache.size > TEXT_CACHE_CAP) textCache.clear();
    textCache.set(key, out);
    return out;
  }

  // ============================================================
  // Engine
  // ============================================================
  function createEngine() {
    // Structural measure cache: node object -> { kids: [childObj...], size }
    let measureCache = new WeakMap();

    // resolve() memo (batches all consumers in one render)
    let lastChildren = null;
    let lastResult = null;

    // Build a parent -> ordered children index for one children array.
    function buildIndex(children) {
      const byId = new Map();
      const byParent = new Map();
      for (const n of children) byId.set(n.id, n);
      for (const n of children) {
        const pid = n.parentId && byId.has(n.parentId) ? n.parentId : "__root__";
        let arr = byParent.get(pid);
        if (!arr) { arr = []; byParent.set(pid, arr); }
        arr.push(n);
      }
      return { byId, byParent };
    }

    // Children that participate in flow (exclude absolute + hidden).
    function flowKids(node, index) {
      const arr = index.byParent.get(node.id) || [];
      return arr.filter((c) => !isAbsolute(c) && !c.hidden);
    }

    // --------------------------------------------------------
    // MEASURE (bottom-up): the node's natural size, i.e. the size it WANTS
    // before any parent stretches it via Fill. Hug frames compute from kids;
    // fixed frames use stored w/h; text hugs its content; leaves use stored.
    // Cached by object identity + child-reference verification.
    // --------------------------------------------------------
    function measure(node, index) {
      // Cache check — valid only if this node object AND every flow-child
      // object reference is identical to the cached pass.
      const cached = measureCache.get(node);
      const kids = isAL(node) ? flowKids(node, index) : null;
      if (cached) {
        let ok = true;
        if (kids) {
          if (cached.kids.length !== kids.length) ok = false;
          else for (let i = 0; i < kids.length; i++) {
            if (cached.kids[i] !== kids[i]) { ok = false; break; }
          }
        }
        if (ok) return cached.size;
      }

      let size;
      if (isAL(node)) {
        const isRow = node.direction !== "column";
        const pad = resolvePadding(node);
        const gap = node.gap ?? 10;
        const n = kids.length;
        const natKids = kids.map(k => measure(k, index));
        // --- Pass 1: resolve the counter-axis inner size. ---
        // A counter-FILL child contributes nothing to the hug max (it
        // stretches to whatever the counter becomes); everyone else
        // contributes their natural counter size.
        let maxCounter = 0;
        kids.forEach((k, i) => {
          const fillCounter = isRow ? sizingV(k) === FILL : sizingH(k) === FILL;
          const kc = isRow ? natKids[i].h : natKids[i].w;
          if (!fillCounter && kc > maxCounter) maxCounter = kc;
        });
        const counterPad = isRow ? pad.t + pad.b : pad.l + pad.r;
        const counterHug = isRow ? sizingV(node) === HUG : sizingH(node) === HUG;
        const counterResolved = counterHug ? maxCounter + counterPad : (isRow ? node.h : node.w);
        const counterInner = Math.max(0, counterResolved - counterPad);
        // --- Pass 2: primary-axis sum. Text that fills the counter axis has
        // its primary size (its wrapped height in a column) re-measured at the
        // resolved counter width, so the hug height matches what's drawn. ---
        let sumPrimary = 0;
        kids.forEach((k, i) => {
          const fillPrimary = isRow ? sizingH(k) === FILL : sizingV(k) === FILL;
          if (fillPrimary) return; // fills leftover; contributes 0 to hug
          let kp = isRow ? natKids[i].w : natKids[i].h;
          const fillCounter = isRow ? sizingV(k) === FILL : sizingH(k) === FILL;
          if (k.type === "text" && (k.sizingMode || "auto-wh") !== "fixed" && fillCounter && !isRow) {
            // Column + counter-fill text: width = counterInner, height reflows.
            kp = measureTextIntrinsic(k, counterInner).h;
          }
          sumPrimary += kp;
        });
        const gaps = node.spacingMode === "space-between" ? 0 : gap * Math.max(0, n - 1);
        const primaryPad = isRow ? pad.l + pad.r : pad.t + pad.b;
        const primaryNat = primaryPad + sumPrimary + gaps;
        const natW = isRow ? primaryNat : counterResolved;
        const natH = isRow ? counterResolved : primaryNat;
        size = {
          w: sizingH(node) === HUG ? Math.max(natW, 1) : node.w,
          h: sizingV(node) === HUG ? Math.max(natH, 1) : node.h,
        };
      } else if (node.type === "text") {
        // Measure the text's intrinsic size so Auto-height (and Auto-width)
        // work inside auto layout: the engine — not just the DOM — must know
        // the wrapped height so hug frames and siblings reflow correctly.
        const sm = node.sizingMode || "auto-wh";
        if (sm === "fixed") {
          size = { w: node.w, h: node.h };
        } else if (sm === "auto-h") {
          const m = measureTextIntrinsic(node, node.w);
          size = { w: node.w, h: m.h };
        } else { // auto-wh — hug both
          const m = measureTextIntrinsic(node, null);
          size = { w: m.w, h: m.h };
        }
      } else {
        size = { w: node.w, h: node.h };
      }

      measureCache.set(node, { kids: kids ? kids.slice() : null, size });
      return size;
    }

    // --------------------------------------------------------
    // ARRANGE (top-down): given a node placed at (x,y) with final (w,h),
    // resolve and place all of its children, then recurse.
    // --------------------------------------------------------
    function arrange(node, x, y, w, h, index, geom) {
      geom.set(node.id, { x, y, w, h });

      const allKids = index.byParent.get(node.id) || [];
      if (!allKids.length) return;

      if (!isAL(node)) {
        // Plain container: children are absolutely positioned in world space.
        // Their stored x/y is world; offset telescopes from this node's
        // resolved origin vs its stored origin (handles nested moved frames).
        for (const k of allKids) {
          if (k.hidden) { geom.set(k.id, { x: k.x, y: k.y, w: k.w, h: k.h }); continue; }
          const ks = measure(k, index);
          const kx = x + (k.x - node.x);
          const ky = y + (k.y - node.y);
          arrange(k, kx, ky, ks.w, ks.h, index, geom);
        }
        return;
      }

      // ---- Auto Layout flow ----
      const isRow = node.direction !== "column";
      const pad = resolvePadding(node);
      const gap = node.gap ?? 10;
      const primary = node.primaryAlign || "start";
      const counter = node.counterAlign || "start";
      const spaceBetween = node.spacingMode === "space-between";

      const flow = allKids.filter((c) => !isAbsolute(c) && !c.hidden);
      const cnt = flow.length;

      const primaryInner = (isRow ? w - pad.l - pad.r : h - pad.t - pad.b);
      const counterInner = (isRow ? h - pad.t - pad.b : w - pad.l - pad.r);
      const primaryStart = isRow ? pad.l : pad.t;
      const counterStart = isRow ? pad.t : pad.l;

      // Resolve each flow child's primary + counter size.
      // Counter: FILL → counterInner; else natural (clamped to counterInner
      // only visually — we keep natural so hug parents already sized it).
      // Primary FILL children share leftover space equally.
      const fillPrimaryIdx = [];
      let usedPrimary = 0;
      const kidSizes = flow.map((k, i) => {
        const ks = measure(k, index);
        let natP = isRow ? ks.w : ks.h;
        const natC = isRow ? ks.h : ks.w;
        const fillP = isRow ? sizingH(k) === FILL : sizingV(k) === FILL;
        const fillC = isRow ? sizingV(k) === FILL : sizingH(k) === FILL;
        const cSize = fillC ? Math.max(1, counterInner) : natC;
        // Column + counter-fill auto text: its width becomes the fill width,
        // so its primary (height) must be re-measured there — otherwise the
        // primary sum (and the next item's position) uses the taller height
        // it had at its narrow natural width, leaving a phantom gap.
        if (k.type === "text" && (k.sizingMode || "auto-wh") !== "fixed" && fillC && !isRow) {
          natP = measureTextIntrinsic(k, cSize).h;
        }
        if (fillP) fillPrimaryIdx.push(i);
        else usedPrimary += natP;
        return { natP, natC, fillP, fillC, cSize, pSize: natP };
      });

      const totalGap = spaceBetween ? 0 : gap * Math.max(0, cnt - 1);
      let leftover = primaryInner - usedPrimary - totalGap;

      if (fillPrimaryIdx.length) {
        // Distribute leftover equally among primary-fill children (min 1px).
        const share = Math.max(1, leftover / fillPrimaryIdx.length);
        for (const i of fillPrimaryIdx) kidSizes[i].pSize = share;
        leftover = 0;
      }

      // Primary positioning: packed honors primaryAlign over leftover space;
      // space-between spreads gaps. With fill children present there is no
      // leftover so both collapse to start packing.
      let effGap = gap;
      let cursor = primaryStart;
      const sumP = kidSizes.reduce((a, k) => a + k.pSize, 0);
      if (spaceBetween && cnt > 1 && !fillPrimaryIdx.length) {
        effGap = (primaryInner - sumP) / (cnt - 1);
      } else if (!fillPrimaryIdx.length) {
        const free = primaryInner - (sumP + gap * Math.max(0, cnt - 1));
        if (primary === "center") cursor += free / 2;
        else if (primary === "end") cursor += free;
      }

      for (let i = 0; i < flow.length; i++) {
        const k = flow[i];
        const ks = kidSizes[i];
        // Counter-axis alignment.
        let coff = 0;
        if (ks.fillC) coff = 0;
        else if (counter === "center") coff = (counterInner - ks.cSize) / 2;
        else if (counter === "end") coff = counterInner - ks.cSize;
        const counterPos = counterStart + coff;

        let kw = isRow ? ks.pSize : ks.cSize;
        let kh = isRow ? ks.cSize : ks.pSize;
        // Auto-height / auto-width text must reflow to the width it actually
        // gets laid out at (which may differ from its natural width when it
        // Fills the container or the frame was resized). Re-measure here so
        // the rendered box, the selection chrome and a hugging parent all
        // agree on the height.
        if (k.type === "text" && (k.sizingMode || "auto-wh") !== "fixed" && sizingV(k) !== FILL) {
          const hugW = (k.sizingMode || "auto-wh") === "auto-wh" && sizingH(k) !== FILL;
          const m = measureTextIntrinsic(k, hugW ? null : kw);
          kh = m.h;
          if (hugW) kw = m.w;
        }
        const kx = x + (isRow ? cursor : counterPos);
        const ky = y + (isRow ? counterPos : cursor);
        arrange(k, kx, ky, kw, kh, index, geom);
        // Advance by the FINAL primary size (after any text re-measure) so a
        // reflowed child doesn't leave a phantom gap before the next item.
        cursor += (isRow ? kw : kh) + effGap;
      }

      // Absolute children: placed by stored world coords, sized naturally.
      for (const k of allKids) {
        if (!isAbsolute(k) || k.hidden) {
          if (k.hidden && isAbsolute(k)) geom.set(k.id, { x: k.x, y: k.y, w: k.w, h: k.h });
          continue;
        }
        const ks = measure(k, index);
        arrange(k, x + (k.x - node.x), y + (k.y - node.y), ks.w, ks.h, index, geom);
      }
    }

    // --------------------------------------------------------
    // Public: resolve full page geometry (memoized by array reference).
    // --------------------------------------------------------
    function resolve(children) {
      if (children === lastChildren && lastResult) return lastResult;
      const index = buildIndex(children);
      const geom = new Map();
      const roots = index.byParent.get("__root__") || [];
      for (const r of roots) {
        const rs = measure(r, index);
        // Roots anchor at their stored position; hug/fill only affect size.
        const rw = sizingH(r) === FILL ? r.w : rs.w; // fill at root → stored
        const rh = sizingV(r) === FILL ? r.h : rs.h;
        arrange(r, r.x, r.y, rw, rh, index, geom);
      }
      lastChildren = children;
      lastResult = { geom, index };
      return lastResult;
    }

    // Reset everything (e.g. on page switch) — rarely needed; the WeakMap
    // self-prunes as node objects are GC'd.
    function reset() {
      measureCache = new WeakMap();
      lastChildren = null;
      lastResult = null;
    }

    return { resolve, measure, buildIndex, flowKids, reset, measureTextIntrinsic };
  }

  const engine = createEngine();

  // ============================================================
  // Reorder helper — given a pointer position (world) over an auto-layout
  // frame, return the insertion index among the frame's flow children.
  // Uses resolved geometry so it works with hug/fill/nested.
  // ============================================================
  function insertionIndex(parent, flow, geom, worldX, worldY) {
    const isRow = parent.direction !== "column";
    let idx = flow.length;
    for (let i = 0; i < flow.length; i++) {
      const g = geom.get(flow[i].id);
      if (!g) continue;
      const mid = isRow ? g.x + g.w / 2 : g.y + g.h / 2;
      const pos = isRow ? worldX : worldY;
      if (pos < mid) { idx = i; break; }
    }
    return idx;
  }

  // Geometry box for a node, falling back to stored coords.
  function box(node, geom) {
    const g = geom && geom.get(node.id);
    return g || { x: node.x, y: node.y, w: node.w, h: node.h };
  }

  window.LayoutEngine = {
    resolve: (children) => engine.resolve(children),
    measure: (node, children) => engine.measure(node, engine.buildIndex(children)),
    flowKids: (node, index) => engine.flowKids(node, index),
    measureTextIntrinsic: engine.measureTextIntrinsic,
    insertionIndex,
    box,
    reset: engine.reset,
    sizing: { H: sizingH, V: sizingV, HUG, FILL, FIXED, isAL, isAbsolute, resolvePadding },
  };

  // Back-compat: keep computeAutoLayout exported by utils working, but route
  // it through the engine so the OLD code paths and the NEW geometry agree.
  // Returns childId -> { x, y } RELATIVE to the parent (legacy contract).
  window.computeAutoLayoutEngine = function (parent, kids, children) {
    if (!isAL(parent)) return null;
    const src = children || (parent.__siblings) || null;
    // When the full children list is available, resolve precisely; otherwise
    // fall back to a local single-frame solve.
    if (src) {
      const { geom } = engine.resolve(src);
      const pg = geom.get(parent.id) || { x: parent.x, y: parent.y };
      const out = {};
      for (const k of kids) {
        const g = geom.get(k.id);
        if (g) out[k.id] = { x: g.x - pg.x, y: g.y - pg.y };
      }
      return out;
    }
    return null;
  };
})();
