import React from "react";
import { Icon } from "./icons.jsx";
import {
  useApp, fillCss, hexToRgba, clamp, fillsOf, fillsPatch, lineHeightCss, paintBg,
} from "./utils.jsx";
import { exportDesign } from "./exportDesign.js";
/* global React, Icon, useApp, fillCss, hexToRgba, clamp */
const { useState, useRef, useEffect, useLayoutEffect, useMemo } = React;

// Format picker + Export button. `getTarget()` returns
// { el, w, h, name, capture? } describing what to rasterize, or null.
function ExportControls({ getTarget }) {
  const [fmt, setFmt] = useState("png");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const t = getTarget && getTarget();
    if (!t || !t.el) { window.alert("Nothing to export."); return; }
    setBusy(true);
    try {
      await exportDesign({
        el: t.el, format: fmt, scale: 2,
        name: t.name || "design", width: t.w, height: t.h, capture: t.capture,
      });
    } catch (e) {
      console.error("Export failed:", e);
      window.alert("Export failed: " + (e && e.message ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="row">
      <select className="export-format" value={fmt} onChange={e => setFmt(e.target.value)} disabled={busy}>
        <option value="png">PNG</option>
        <option value="jpeg">JPG</option>
        <option value="pdf">PDF</option>
      </select>
      <button className="select-mini export-btn" onClick={run} disabled={busy}
              style={{ flex: 1, border: "1px solid var(--app-border)", justifyContent: "center" }}>
        <Icon.Download size={12} /> {busy ? "Exporting…" : "Export"}
      </button>
    </div>
  );
}

// ----- Number input that reacts to drag (scrubbing) -----
// Accepts plain numbers OR simple arithmetic expressions:
//   "300-10" → 290    "300 + 5*2" → 310    "300/2" → 150
// Whitelist regex blocks anything that isn't a number / operator / paren.
function evalNumeric(input, fallback) {
  if (input == null) return fallback;
  const s = String(input).trim();
  if (s === "") return fallback;
  // Plain number — fast path.
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  // Arithmetic expression — must contain ONLY digits, dots, + - * / ( ) and spaces.
  if (!/^[\d+\-*/().\s]+$/.test(s)) return fallback;
  try {
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict"; return (${s});`)();
    return typeof r === "number" && isFinite(r) ? r : fallback;
  } catch {
    return fallback;
  }
}

function NumInput({ value, onChange, prefix, suffix, min, max, step = 1, style, disabled }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  useEffect(() => { setV(value); }, [value]);
  const commit = (s) => {
    if (disabled) return;
    const n = evalNumeric(s, NaN);
    if (!isNaN(n)) {
      const clamped = max != null ? Math.min(max, n) : n;
      const c2 = min != null ? Math.max(min, clamped) : clamped;
      onChange(c2);
      // Reflect the resolved value back in the field (so "300-10" becomes "290")
      setV(c2);
    } else {
      setV(value);
    }
  };
  const onPrefixDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    const start = e.clientX, orig = parseFloat(v) || 0;
    const mv = (ev) => { commit(orig + (ev.clientX - start) * step); };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  return (
    <div className="input-wrap" style={{ ...style, ...(disabled ? { opacity: 0.55 } : null) }}>
      {prefix && <span className="prefix" onMouseDown={onPrefixDown} style={{ cursor: disabled ? "default" : "ew-resize" }}>{prefix}</span>}
      <input
        ref={ref}
        type="text"
        value={v}
        disabled={disabled}
        onChange={e => setV(e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={() => commit(v)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.target.blur(); }
          if (e.key === "ArrowUp") { e.preventDefault(); commit((evalNumeric(v, value) || 0) + (e.shiftKey ? 10 : 1)); }
          if (e.key === "ArrowDown") { e.preventDefault(); commit((evalNumeric(v, value) || 0) - (e.shiftKey ? 10 : 1)); }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}

// ----- Auto layout (Figma-style) -----
// Small inline glyphs for the padding fields (rounded frame + the two inset
// edges being controlled). currentColor so they pick up the prefix color.
const PadHGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.3" strokeLinecap="round">
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" opacity="0.45" strokeDasharray="2 1.6"/>
    <path d="M4.7 5v6M11.3 5v6"/>
  </svg>
);
const PadVGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.3" strokeLinecap="round">
    <rect x="2.5" y="2" width="11" height="12" rx="1.5" opacity="0.45" strokeDasharray="2 1.6"/>
    <path d="M5 4.7h6M5 11.3h6"/>
  </svg>
);
// All-sides padding glyph — frame with an inset rectangle (uniform inset).
const PadAllGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.3" strokeLinecap="round">
    <rect x="2" y="2" width="12" height="12" rx="1.5" opacity="0.45"/>
    <rect x="5" y="5" width="6" height="6" rx="1"/>
  </svg>
);
// Per-side glyphs for individual-padding mode.
const sideGlyph = (side) => {
  const lines = {
    top:    "M5 4.7h6", right: "M11.3 5v6", bottom: "M5 11.3h6", left: "M4.7 5v6",
  }[side];
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
         strokeWidth="1.3" strokeLinecap="round">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" opacity="0.4"/>
      <path d={lines}/>
    </svg>
  );
};

// 3×3 alignment matrix. Clicking a cell sets primary/counter alignment; the
// little bars preview how children will pack, oriented to the flow direction.
function AlignGrid({ n, update }) {
  const isRow = n.direction !== "column";
  const order = ["start", "center", "end"];
  const cur = { primary: n.primaryAlign || "start", counter: n.counterAlign || "start" };
  const spaceBetween = n.spacingMode === "space-between";
  // Map a grid cell (col,row) → {primary,counter} based on flow axis.
  const cellAlign = (col, row) => isRow
    ? { primary: order[col], counter: order[row] }
    : { primary: order[row], counter: order[col] };
  const isActive = (col, row) => {
    const a = cellAlign(col, row);
    // In space-between mode the primary axis is "spread", so highlight the
    // whole primary track — only the counter cell matters.
    if (spaceBetween) return a.counter === cur.counter && a.primary === "start";
    return a.primary === cur.primary && a.counter === cur.counter;
  };
  const just = { start: "flex-start", center: "center", end: "flex-end" };
  return (
    <div className="al-grid" title="Alignment">
      <div className="al-cells">
        {[0, 1, 2].map(row => [0, 1, 2].map(col => (
          <button key={`${row}-${col}`} className={"al-cell" + (isActive(col, row) ? " on" : "")}
                  onClick={() => { const a = cellAlign(col, row); update({ primaryAlign: a.primary, counterAlign: a.counter }); }}>
            <span className="al-dot"/>
          </button>
        )))}
      </div>
      <div className="al-bars" style={{
        flexDirection: isRow ? "row" : "column",
        justifyContent: spaceBetween ? "space-between" : just[cur.primary],
        alignItems: just[cur.counter],
      }}>
        <span/><span/><span/>
      </div>
    </div>
  );
}

// Vertical-spacing glyph for the gap field (column layouts) — three
// horizontal rules compressed vertically. currentColor so it picks up the
// muted prefix color.
const GapVGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 22V20H22V22H2ZM7 13.5V10.5H17V13.5H7ZM2 4V2H22V4H2Z"/>
  </svg>
);

// Gap field with a chevron that opens the spacing-mode menu.
function GapField({ n, update }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const spaceBetween = n.spacingMode === "space-between";
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  const isRow = n.direction !== "column";
  const gapGlyph = isRow ? "⇿" : <GapVGlyph/>;
  return (
    <div ref={ref} className="al-gap" style={{ position: "relative", flex: 1, minWidth: 0 }}>
      {spaceBetween ? (
        <div className="input-wrap al-gap-auto" onClick={() => setOpen(o => !o)} style={{ cursor: "pointer" }}>
          <span className="prefix">{gapGlyph}</span>
          <input readOnly value="Auto" style={{ cursor: "pointer", fontStyle: "italic", color: "var(--app-fg-3)" }}/>
          <span className="suffix al-gap-caret"><Icon.Chevron size={11}/></span>
        </div>
      ) : (
        <div className="input-wrap">
          <span className="prefix" style={{ cursor: "default" }}>{gapGlyph}</span>
          <NumInputBare value={n.gap ?? 10} min={0} onChange={v => update({ gap: v })}/>
          <span className="suffix al-gap-caret" style={{ cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
            <Icon.Chevron size={11}/>
          </span>
        </div>
      )}
      {open && (
        <div className="al-menu">
          <button className={!spaceBetween ? "on" : ""} onClick={() => { update({ spacingMode: "packed" }); setOpen(false); }}>
            Packed
          </button>
          <button className={spaceBetween ? "on" : ""} onClick={() => { update({ spacingMode: "space-between" }); setOpen(false); }}>
            Space between
          </button>
        </div>
      )}
    </div>
  );
}

// Bare numeric input (no wrapping pill) for composing inside custom controls.
function NumInputBare({ value, onChange, min, max }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = (s) => {
    const num = evalNumeric(s, NaN);
    if (!isNaN(num)) {
      let c = num;
      if (max != null) c = Math.min(max, c);
      if (min != null) c = Math.max(min, c);
      onChange(c); setV(c);
    } else setV(value);
  };
  return (
    <input type="text" value={v}
           onChange={e => setV(e.target.value)}
           onFocus={e => e.target.select()}
           onBlur={() => commit(v)}
           onKeyDown={e => {
             if (e.key === "Enter") e.target.blur();
             if (e.key === "ArrowUp") { e.preventDefault(); commit((evalNumeric(v, value) || 0) + (e.shiftKey ? 10 : 1)); }
             if (e.key === "ArrowDown") { e.preventDefault(); commit((evalNumeric(v, value) || 0) - (e.shiftKey ? 10 : 1)); }
           }}/>
  );
}

function AutoLayoutPanel({ n, update }) {
  const [tuneOpen, setTuneOpen] = useState(false);
  const tuneRef = useRef(null);
  useEffect(() => {
    if (!tuneOpen) return;
    const click = (e) => { if (!tuneRef.current?.contains(e.target)) setTuneOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [tuneOpen]);
  const indiv = !!n.paddingIndividual;
  // Padding entry mode: "all" (one field → every side), "axis" (H + V), or
  // "individual" (four sides). Defaults to "axis" to preserve old documents.
  const padMode = indiv ? "individual" : (n.paddingMode === "all" ? "all" : "axis");
  const setPadMode = (m) => {
    if (m === "individual") { update({ paddingIndividual: true }); return; }
    if (m === "all") {
      // Collapse to a single value so the field shows something sensible.
      const v = n.paddingX ?? n.paddingTop ?? 16;
      update({ paddingIndividual: false, paddingMode: "all",
               paddingX: v, paddingY: v, paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v });
      return;
    }
    update({ paddingIndividual: false, paddingMode: "axis" });
  };
  // Setting "all" writes every padding field so the value stays consistent
  // no matter which mode reads it later.
  const setAllPadding = (v) => update({
    paddingX: v, paddingY: v, paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v,
  });
  return (
    <div className="al-panel">
      {/* direction + advanced */}
      <div className="al-top">
        <div className="toggle-pill al-dir">
          <button className={n.direction !== "column" ? "on" : ""} title="Horizontal"
                  onClick={() => update({ direction: "row" })}><Icon.ArrowRight size={14}/></button>
          <button className={n.direction === "column" ? "on" : ""} title="Vertical"
                  onClick={() => update({ direction: "column" })}><Icon.ArrowDown size={14}/></button>
        </div>
        <div ref={tuneRef} style={{ position: "relative" }}>
          <button className={"al-tune" + (tuneOpen ? " on" : "")} title="Advanced layout"
                  onClick={() => setTuneOpen(o => !o)}><Icon.Sliders size={15}/></button>
          {tuneOpen && (
            <div className="al-menu al-tune-menu">
              <label className="al-check">
                <input type="checkbox" checked={n.clipContent !== false}
                       onChange={e => update({ clipContent: e.target.checked })}/>
                Clip content
              </label>
              <div className="al-pad-mode">
                <div className="al-pad-mode-label">Padding</div>
                <div className="toggle-pill al-pad-mode-pill">
                  <button className={padMode === "all" ? "on" : ""} title="All sides — one value"
                          onClick={() => setPadMode("all")}><PadAllGlyph/></button>
                  <button className={padMode === "axis" ? "on" : ""} title="Horizontal & vertical"
                          onClick={() => setPadMode("axis")}><PadHGlyph/></button>
                  <button className={padMode === "individual" ? "on" : ""} title="Individual sides"
                          onClick={() => setPadMode("individual")}><Icon.IndividualSides size={14}/></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="al-main">
        <AlignGrid n={n} update={update}/>
        <div className="al-fields">
          <div className="row"><GapField n={n} update={update}/></div>
          {padMode === "all" ? (
            <div className="row">
              <NumInput prefix={<PadAllGlyph/>} value={n.paddingX ?? 16} min={0} onChange={setAllPadding}/>
              <div className="input-wrap" style={{ visibility: "hidden", pointerEvents: "none" }} aria-hidden="true"/>
            </div>
          ) : padMode === "axis" ? (
            <div className="row">
              <NumInput prefix={<PadHGlyph/>} value={n.paddingX ?? 16} min={0} onChange={v => update({ paddingX: v })}/>
              <NumInput prefix={<PadVGlyph/>} value={n.paddingY ?? 16} min={0} onChange={v => update({ paddingY: v })}/>
            </div>
          ) : (
            <div className="al-pad-grid">
              <NumInput prefix={sideGlyph("top")}    value={n.paddingTop ?? 16}    min={0} onChange={v => update({ paddingTop: v })}/>
              <NumInput prefix={sideGlyph("right")}  value={n.paddingRight ?? 16}  min={0} onChange={v => update({ paddingRight: v })}/>
              <NumInput prefix={sideGlyph("bottom")} value={n.paddingBottom ?? 16} min={0} onChange={v => update({ paddingBottom: v })}/>
              <NumInput prefix={sideGlyph("left")}   value={n.paddingLeft ?? 16}   min={0} onChange={v => update({ paddingLeft: v })}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----- Layout sizing (Fixed / Hug / Fill) per axis -----
// Mirrors Figma's W/H sizing menus. Hug is offered for auto-layout frames
// (and text); Fill is offered for any child of an auto-layout frame. The
// numeric field shows the RESOLVED size and is editable — typing a value
// pins the axis to Fixed at that number.
function sizingMenuOptions(n, axis, children) {
  const parent = n.parentId ? children.find(c => c.id === n.parentId) : null;
  const parentAL = !!(parent && parent.type === "frame" && parent.autoLayout);
  const selfAL = n.type === "frame" && n.autoLayout;
  const opts = [{ v: "fixed", label: "Fixed" }];
  if (selfAL) opts.push({ v: "hug", label: "Hug contents" });
  if (parentAL) opts.push({ v: "fill", label: "Fill container" });
  return opts;
}

function SizingMenu({ value, options, onPick }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const W = 150;
    // Right-align the menu to the button, but clamp into the viewport so it
    // never gets clipped by the panel's overflow (it's rendered fixed).
    let left = r.right - W;
    if (left < 8) left = 8;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - 8 - W;
    setPos({ left, top: r.bottom + 4, width: W });
    setOpen(true);
  };
  const cur = options.find(o => o.v === value) || options[0];
  const glyph = value === "hug" ? "↔" : value === "fill" ? "⤢" : "⊟";
  return (
    <div className="sizing-menu-wrap" style={{ position: "relative" }}>
      <button ref={btnRef} className="sizing-menu-btn" title={cur.label} onClick={toggle}>
        <span className="sizing-menu-glyph">{glyph}</span>
        <Icon.Chevron size={10}/>
      </button>
      {open && pos && (
        <div ref={ref} className="al-menu sizing-menu-pop"
             style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, minWidth: pos.width, right: "auto" }}>
          {options.map(o => (
            <button key={o.v} className={o.v === value ? "on" : ""}
                    onClick={() => { onPick(o.v); setOpen(false); }}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// W/H row that understands hug/fill. `resolved` is the engine geometry box
// for the node (or null) used to show the live size on hug/fill axes.
function LayoutSizeRow({ n, update, children, resolved, resizeTextSafe }) {
  const optsW = sizingMenuOptions(n, "w", children);
  const optsH = sizingMenuOptions(n, "h", children);
  const curW = n.layoutSizingH || "fixed";
  const curH = n.layoutSizingV || "fixed";
  // Always prefer the engine-resolved size for display (it equals the stored
  // size for Fixed nodes, and reflects hug/fill/auto-height for the rest).
  const rw = Math.round(resolved?.w ?? n.w);
  const rh = Math.round(resolved?.h ?? n.h);
  const locked = !!n.lockRatio;
  const canRatio = locked && rw > 0 && rh > 0;
  const setW = (v) => {
    // Typing a width pins to Fixed at that value.
    const base = n.type === "text" && resizeTextSafe ? resizeTextSafe(n, { w: v }, "w") : { w: v };
    const patch = { ...base, layoutSizingH: "fixed" };
    // With proportions locked, scale height to keep the current aspect ratio.
    if (canRatio) { patch.h = Math.max(1, Math.round(v * rh / rw)); patch.layoutSizingV = "fixed"; }
    update(patch);
  };
  const setH = (v) => {
    const base = n.type === "text" && resizeTextSafe ? resizeTextSafe(n, { h: v }, "h") : { h: v };
    const patch = { ...base, layoutSizingV: "fixed" };
    if (canRatio) { patch.w = Math.max(1, Math.round(v * rw / rh)); patch.layoutSizingH = "fixed"; }
    update(patch);
  };
  const pickW = (mode) => update(mode === "fixed" ? { layoutSizingH: "fixed", w: rw } : { layoutSizingH: mode });
  const pickH = (mode) => update(mode === "fixed" ? { layoutSizingV: "fixed", h: rh } : { layoutSizingV: mode });
  return (
    <div className="row">
      <div className="size-field">
        <NumInput prefix="W" value={rw} min={1} onChange={setW} style={{ flex: 1 }}/>
        {optsW.length > 1 && <SizingMenu value={curW} options={optsW} onPick={pickW}/>}
      </div>
      <button className={`ratio-lock ${locked ? "on" : ""}`}
              onClick={() => update({ lockRatio: !locked })}
              title={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
              aria-pressed={locked}>
        {locked ? <Icon.Lock size={12} /> : <Icon.Link size={12} />}
      </button>
      <div className="size-field">
        <NumInput prefix="H" value={rh} min={1} onChange={setH} style={{ flex: 1 }}/>
        {optsH.length > 1 && <SizingMenu value={curH} options={optsH} onPick={pickH}/>}
      </div>
    </div>
  );
}
const GOOGLE_FONTS = [
  "Inter", "Roboto", "Poppins", "Open Sans", "Lato", "Montserrat",
  "Playfair Display", "Merriweather", "Source Sans 3", "Nunito",
  "Raleway", "DM Sans", "DM Serif Display", "Space Grotesk", "Space Mono",
  "IBM Plex Sans", "IBM Plex Mono", "JetBrains Mono", "Fira Code",
  "Geist", "Geist Mono", "Manrope", "Work Sans", "Instrument Serif",
];
const loadedFonts = new Set();
function ensureFont(family) {
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@300;400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}
window.ensureFont = ensureFont;
function FontPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null); // { left, top, width, maxH }
  useEffect(() => { ensureFont(value); }, [value]);
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  // Position the popup with FIXED coordinates beside the right panel so it
  // escapes the panel's overflow:auto clipping and opens as a floating panel
  // (consistent with the color picker) rather than a dropdown over the panel.
  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const place = () => {
      const r = triggerRef.current.getBoundingClientRect();
      const margin = 8, W = 248, desiredH = 380;
      // Float to the LEFT of the right panel (like the color picker) instead of
      // dropping down inside the panel column, then center vertically on the
      // trigger and clamp into the viewport.
      const rp = document.querySelector(".right-panel")?.getBoundingClientRect();
      const left = Math.max(margin, (rp ? rp.left : window.innerWidth - 260) - W - margin);
      const maxH = Math.min(desiredH, window.innerHeight - margin * 2);
      let top = r.top + r.height / 2 - maxH / 2;
      top = Math.max(margin, Math.min(top, window.innerHeight - margin - maxH));
      setPos({ left, top, width: W, maxH });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  const filtered = GOOGLE_FONTS.filter(f => f.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div ref={triggerRef} className="input-wrap" onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        <input readOnly value={value} style={{ fontFamily: value, cursor: "pointer" }}/>
        <span className="suffix" style={{ display: "flex", alignItems: "center" }}><Icon.ChevronR size={9} style={{ transform: "rotate(90deg)" }}/></span>
      </div>
      {open && pos && (
        <div ref={popRef} style={{
          position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 1000,
          background: "var(--app-panel)", border: "1px solid var(--app-border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 5,
          display: "flex", flexDirection: "column", maxHeight: pos.maxH
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 6px" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-fg)" }}>Fonts</span>
            <button className="icon-btn" onClick={() => setOpen(false)} title="Close"><Icon.Close size={12}/></button>
          </div>
          <input autoFocus placeholder="Search fonts" value={q} onChange={e => setQ(e.target.value)}
                 style={{ width: "100%", background: "var(--app-panel-2)", border: "1px solid var(--app-border)",
                          borderRadius: 6, padding: "5px 8px", color: "var(--app-fg)", fontSize: 12, outline: "none", marginBottom: 4 }}/>
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {filtered.map(f => {
            ensureFont(f);
            const sel = f === value;
            return (
              <div key={f}
                   onMouseEnter={e => { ensureFont(f); e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
                   onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--app-fg)"; }}
                   onClick={() => { onChange(f); setOpen(false); }}
                   style={{
                     display: "flex", alignItems: "center", gap: 6,
                     padding: "6px 12px 6px 8px", fontSize: 13, cursor: "pointer", borderRadius: 6,
                     color: "var(--app-fg)",
                   }}>
                <span style={{ width: 14, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  {sel && <Icon.Check size={12}/>}
                </span>
                <span style={{ fontFamily: f }}>{f}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--app-fg-3)" }}>No fonts match “{q}”.</div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Color conversion helpers ----------
function hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  const n = h.length === 3 ? h.split("").map(c => c + c).join("") : h.padEnd(6, "0");
  const v = parseInt(n, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function rgbToHex({ r, g, b }) {
  const to = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return ("#" + to(r) + to(g) + to(b)).toUpperCase();
}
function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToRgb({ h, s, v }) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; }
  else if (h < 120){ r = x; g = c; }
  else if (h < 180){ g = c; b = x; }
  else if (h < 240){ g = x; b = c; }
  else if (h < 300){ r = x; b = c; }
  else             { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
function hsvToHsl({ h, s, v }) {
  const l = v * (1 - s / 2);
  const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
  return { h, s: sl, l };
}
function hslToHsv({ h, s, l }) {
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return { h, s: sv, v };
}

// Color picker popover (Figma-style: SV area + Hue + Alpha + mode inputs)
function ColorPopover({ value, onChange, onClose, anchor, allowGradient }) {
  const ref = useRef(null);
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const alphaRef = useRef(null);

  // ----- Paint type + gradient state -----
  // The picker can edit a Solid OR a Linear/Radial gradient paint. We keep
  // gradient stops + angle as their own state so the user can flip between
  // types without losing data.
  const initialType = (value?.type === "linear" || value?.type === "radial") ? value.type : "solid";
  const [paintType, setPaintType] = useState(initialType);
  const [stops, setStops] = useState(() => {
    if (Array.isArray(value?.stops) && value.stops.length >= 2) return value.stops.slice();
    // Seed sensible defaults using the current solid color as first stop.
    const start = value?.color || "#FFFFFF";
    return [
      { color: start, opacity: value?.opacity ?? 1, position: 0 },
      { color: "#000000", opacity: 1, position: 1 },
    ];
  });
  const [selStopIdx, setSelStopIdx] = useState(0);
  const [angle, setAngle] = useState(typeof value?.angle === "number" ? value.angle : 180);

  // The "active" color/opacity drives the HSV / sliders. For a solid paint
  // that's the paint itself; for a gradient it's the currently selected stop.
  const activeColor = paintType === "solid" ? (value?.color || "#000000") : (stops[selStopIdx]?.color || "#000000");
  const activeOpacity = paintType === "solid" ? (value?.opacity ?? 1) : (stops[selStopIdx]?.opacity ?? 1);

  // Internal HSV state — keeps hue stable when S or V hit 0.
  const initial = useMemo(() => rgbToHsv(hexToRgb(activeColor)), []);
  const [hsv, setHsv] = useState(initial);
  const [alpha, setAlpha] = useState(activeOpacity);
  const [mode, setMode] = useState("HSL"); // "HSL" | "RGB" | "HEX"
  const [modeOpen, setModeOpen] = useState(false);

  // Favorite swatches — persisted to localStorage.
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem("cp.favorites");
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) return arr;
    } catch (_) {}
    return [];
  });
  const saveFavorites = (next) => {
    setFavorites(next);
    try { localStorage.setItem("cp.favorites", JSON.stringify(next)); } catch (_) {}
  };
  const addFavorite = () => {
    // Store the color only — swatches are shown as solid fills.
    if (favorites.some(f => f.color === hex)) return;
    saveFavorites([{ color: hex }, ...favorites].slice(0, 24));
  };
  const removeFavorite = (idx) => saveFavorites(favorites.filter((_, i) => i !== idx));
  const applyFavorite = (f) => {
    const next = rgbToHsv(hexToRgb(f.color));
    setHsv(next); setAlpha(1); emit(next, 1);
  };

  // Sync FROM props when the popover is opened on a new value or the
  // selected stop changes.
  const lastSyncedHex = useRef(activeColor);
  useEffect(() => {
    const targetHex = (activeColor || "#000000").toUpperCase();
    if (targetHex !== (lastSyncedHex.current || "").toUpperCase()) {
      setHsv(rgbToHsv(hexToRgb(targetHex)));
      lastSyncedHex.current = targetHex;
    }
    setAlpha(activeOpacity);
  }, [activeColor, activeOpacity]);

  const rgb = hsvToRgb(hsv);
  const hex = rgbToHex(rgb);
  const hsl = hsvToHsl(hsv);

  // Build the next paint to emit given a new active color/opacity. Branches
  // on the current paint type: solid edits color/opacity directly; gradients
  // edit the selected stop and rebuild the stops array.
  const buildPaint = (nhex, na, overrides = {}) => {
    const type = overrides.paintType || paintType;
    const visible = value?.visible !== false;
    if (type === "solid") {
      return { type: "solid", color: nhex, opacity: na, visible };
    }
    const nextStops = (overrides.stops || stops).slice();
    if (!overrides.stops) {
      // Update the selected stop with the new active color/opacity.
      const i = overrides.selStopIdx ?? selStopIdx;
      nextStops[i] = { ...nextStops[i], color: nhex, opacity: na };
    }
    const out = { type, stops: nextStops, opacity: value?.opacity ?? 1, visible };
    if (type === "linear") out.angle = overrides.angle ?? angle;
    return out;
  };

  // Emit a change without round-tripping through props.
  const emit = (nextHsv, nextAlpha, overrides) => {
    const nh = nextHsv ?? hsv;
    const na = nextAlpha ?? alpha;
    const nhex = rgbToHex(hsvToRgb(nh));
    lastSyncedHex.current = nhex;
    const next = buildPaint(nhex, na, overrides || {});
    if (next.type !== "solid" && (overrides?.stops == null) && !overrides?.paintType) {
      // Keep local stops state in sync with the version we just emitted.
      setStops(next.stops);
    }
    onChange(next);
  };

  // Click-outside close
  useEffect(() => {
    const click = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, []);

  // ---- Drag handlers for SV / Hue / Alpha ----
  const dragOn = (el, handler) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      handler(clamp((t.clientX - r.left) / r.width, 0, 1),
              clamp((t.clientY - r.top) / r.height, 0, 1));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return move;
  };

  const onSvDown = (e) => {
    e.preventDefault();
    const move = dragOn(svRef.current, (px, py) => {
      const next = { ...hsv, s: px, v: 1 - py };
      setHsv(next); emit(next);
    });
    move(e);
  };
  const onHueDown = (e) => {
    e.preventDefault();
    const move = dragOn(hueRef.current, (px) => {
      const next = { ...hsv, h: px * 360 };
      setHsv(next); emit(next);
    });
    move(e);
  };
  const onAlphaDown = (e) => {
    e.preventDefault();
    const move = dragOn(alphaRef.current, (px) => {
      setAlpha(px); emit(null, px);
    });
    move(e);
  };

  // ---- Eyedropper (Chromium / Edge) ----
  const pickEyedropper = async () => {
    if (typeof window.EyeDropper !== "function") return;
    try {
      const res = await new window.EyeDropper().open();
      const rgbP = hexToRgb(res.sRGBHex);
      const next = rgbToHsv(rgbP);
      setHsv(next); emit(next);
    } catch (_) { /* user canceled */ }
  };

  // ---- Gradient helpers ----
  const stopsBarRef = useRef(null);
  const selectStop = (i) => {
    setSelStopIdx(i);
    const s = stops[i];
    if (s) {
      setHsv(rgbToHsv(hexToRgb(s.color)));
      setAlpha(s.opacity ?? 1);
      lastSyncedHex.current = (s.color || "").toUpperCase();
    }
  };
  const switchType = (t) => {
    if (t === paintType) return;
    if (t === "solid") {
      // Use the currently-selected stop's color as the solid color.
      const cur = stops[selStopIdx] || stops[0];
      const nhex = (cur?.color) || hex;
      const na = cur?.opacity ?? alpha;
      setPaintType("solid");
      setHsv(rgbToHsv(hexToRgb(nhex)));
      setAlpha(na);
      lastSyncedHex.current = nhex;
      onChange({ type: "solid", color: nhex, opacity: na, visible: value?.visible !== false });
      return;
    }
    // Going to a gradient. Reuse existing stops state (which we seeded from
    // the prior solid if needed).
    let nextStops = stops;
    if (paintType === "solid") {
      // Seed first stop with current solid color so the user sees their
      // existing color preserved.
      nextStops = [
        { color: hex, opacity: alpha, position: 0 },
        { color: "#000000", opacity: 1, position: 1 },
      ];
      setStops(nextStops);
      setSelStopIdx(0);
    }
    setPaintType(t);
    const out = { type: t, stops: nextStops, opacity: value?.opacity ?? 1, visible: value?.visible !== false };
    if (t === "linear") out.angle = angle;
    onChange(out);
  };
  const stopsEmit = (nextStops, nextSel = selStopIdx) => {
    setStops(nextStops);
    setSelStopIdx(nextSel);
    const out = { type: paintType, stops: nextStops, opacity: value?.opacity ?? 1, visible: value?.visible !== false };
    if (paintType === "linear") out.angle = angle;
    onChange(out);
    const s = nextStops[nextSel];
    if (s) {
      setHsv(rgbToHsv(hexToRgb(s.color)));
      setAlpha(s.opacity ?? 1);
      lastSyncedHex.current = (s.color || "").toUpperCase();
    }
  };
  const addStop = (pos) => {
    // Find neighbors in the sorted order and interpolate color.
    const sorted = stops.map((s, idx) => ({ ...s, _idx: idx })).sort((a, b) => a.position - b.position);
    let left = sorted[0], right = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].position <= pos && sorted[i+1].position >= pos) { left = sorted[i]; right = sorted[i+1]; break; }
    }
    const span = right.position - left.position || 1;
    const t = clamp((pos - left.position) / span, 0, 1);
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const lc = hexToRgb(left.color), rc = hexToRgb(right.color);
    const color = rgbToHex({ r: lerp(lc.r, rc.r), g: lerp(lc.g, rc.g), b: lerp(lc.b, rc.b) });
    const opacity = (left.opacity ?? 1) + (((right.opacity ?? 1) - (left.opacity ?? 1)) * t);
    const next = stops.concat([{ color, opacity, position: pos }]);
    stopsEmit(next, next.length - 1);
  };
  const removeStop = (i) => {
    if (stops.length <= 2) return;
    const next = stops.filter((_, j) => j !== i);
    stopsEmit(next, Math.max(0, Math.min(selStopIdx, next.length - 1)));
  };
  const setStopPos = (i, pos) => {
    const next = stops.map((s, j) => j === i ? { ...s, position: clamp(pos, 0, 1) } : s);
    setStops(next);
    const out = { type: paintType, stops: next, opacity: value?.opacity ?? 1, visible: value?.visible !== false };
    if (paintType === "linear") out.angle = angle;
    onChange(out);
  };
  const setAngleEmit = (a) => {
    const na = ((a % 360) + 360) % 360;
    setAngle(na);
    const out = { type: paintType, stops, opacity: value?.opacity ?? 1, visible: value?.visible !== false, angle: na };
    onChange(out);
  };
  const onStopDown = (e, i) => {
    e.stopPropagation();
    e.preventDefault();
    selectStop(i);
    const bar = stopsBarRef.current;
    if (!bar) return;
    const move = (ev) => {
      const r = bar.getBoundingClientRect();
      const t = ev.touches ? ev.touches[0] : ev;
      const px = clamp((t.clientX - r.left) / r.width, 0, 1);
      setStopPos(i, px);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
  };
  const onBarClick = (e) => {
    // Only add a stop when clicking the bar background (not an existing handle).
    if (e.target.closest(".cp-stop")) return;
    const r = stopsBarRef.current.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1);
    // Add the stop AND immediately attach a drag so click-drag in one
    // motion lets the user place it precisely.
    const sorted = stops.map((s, idx) => ({ ...s, _idx: idx })).sort((a, b) => a.position - b.position);
    let left = sorted[0], right = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].position <= px && sorted[i+1].position >= px) { left = sorted[i]; right = sorted[i+1]; break; }
    }
    const span = right.position - left.position || 1;
    const t = clamp((px - left.position) / span, 0, 1);
    const lerp = (a, b) => Math.round(a + (b - a) * t);
    const lc = hexToRgb(left.color), rc = hexToRgb(right.color);
    const color = rgbToHex({ r: lerp(lc.r, rc.r), g: lerp(lc.g, rc.g), b: lerp(lc.b, rc.b) });
    const opacity = (left.opacity ?? 1) + (((right.opacity ?? 1) - (left.opacity ?? 1)) * t);
    const next = stops.concat([{ color, opacity, position: px }]);
    const newIdx = next.length - 1;
    stopsEmit(next, newIdx);
    // Begin a drag from this point so the user can fine-tune position.
    const bar = stopsBarRef.current;
    const move = (ev) => {
      const r2 = bar.getBoundingClientRect();
      const tt = ev.touches ? ev.touches[0] : ev;
      const xx = clamp((tt.clientX - r2.left) / r2.width, 0, 1);
      setStopPos(newIdx, xx);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ---- Numeric input editing ----
  const onHexInput = (str) => {
    const v = str.replace("#", "");
    if (/^[0-9a-fA-F]{6}$/.test(v)) {
      const next = rgbToHsv(hexToRgb("#" + v));
      setHsv(next); emit(next);
    }
  };
  const onRgbInput = (k, raw) => {
    const v = clamp(parseFloat(raw) || 0, 0, 255);
    const nrgb = { ...rgb, [k]: v };
    const next = rgbToHsv(nrgb);
    setHsv(next); emit(next);
  };
  const onHslInput = (k, raw) => {
    const max = k === "h" ? 360 : 100;
    const v = clamp(parseFloat(raw) || 0, 0, max);
    const nhsl = { ...hsl, [k]: k === "h" ? v : v / 100 };
    const next = hslToHsv(nhsl);
    setHsv(next); emit(next);
  };
  const onAlphaInput = (raw) => {
    const v = clamp(parseFloat(raw) || 0, 0, 100) / 100;
    setAlpha(v); emit(null, v);
  };

  // Smart positioning — open to the LEFT of the right inspector panel (not
  // inside it). Falls back to a clamped estimate on first render so we never
  // paint off-screen.
  const POPOVER_W = 248;
  const POPOVER_H_ESTIMATE = 440;
  const getRightPanelLeft = () =>
    document.querySelector(".right-panel")?.getBoundingClientRect().left ?? window.innerWidth - 260;
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, getRightPanelLeft() - POPOVER_W - 8),
    top:  Math.max(8, Math.min((anchor?.y ?? 0) - POPOVER_H_ESTIMATE / 2 + 12, window.innerHeight - POPOVER_H_ESTIMATE - 8)),
  }));
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reposition = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const left = Math.max(8, getRightPanelLeft() - w - 8);
      let top = (anchor?.y ?? 0) - h / 2 + 12; // center the popover on the trigger row
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      setPos({ left, top });
    };
    reposition();
    // Re-clamp whenever the popover's size changes (e.g. when the user adds
    // a gradient stop, switches paint type, or favorites grid grows).
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor?.x, anchor?.y]);

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const pureRgb = `rgb(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)})`;

  // Mode-specific numeric inputs
  const renderInputs = () => {
    if (mode === "HEX") {
      return (
        <>
          <div className="cp-input cp-input-wide">
            <input value={hex.replace("#", "")} onChange={e => onHexInput(e.target.value)} maxLength={6} />
          </div>
          <div className="cp-input">
            <input type="number" value={Math.round(alpha * 100)} min={0} max={100}
                   onChange={e => onAlphaInput(e.target.value)} />
            <span className="cp-suffix">%</span>
          </div>
        </>
      );
    }
    if (mode === "RGB") {
      return (
        <>
          <div className="cp-input"><input type="number" value={Math.round(rgb.r)} min={0} max={255}
                 onChange={e => onRgbInput("r", e.target.value)} /></div>
          <div className="cp-input"><input type="number" value={Math.round(rgb.g)} min={0} max={255}
                 onChange={e => onRgbInput("g", e.target.value)} /></div>
          <div className="cp-input"><input type="number" value={Math.round(rgb.b)} min={0} max={255}
                 onChange={e => onRgbInput("b", e.target.value)} /></div>
          <div className="cp-input">
            <input type="number" value={Math.round(alpha * 100)} min={0} max={100}
                   onChange={e => onAlphaInput(e.target.value)} />
            <span className="cp-suffix">%</span>
          </div>
        </>
      );
    }
    // HSL
    return (
      <>
        <div className="cp-input"><input type="number" value={Math.round(hsl.h)} min={0} max={360}
               onChange={e => onHslInput("h", e.target.value)} /></div>
        <div className="cp-input"><input type="number" value={Math.round(hsl.s * 100)} min={0} max={100}
               onChange={e => onHslInput("s", e.target.value)} /></div>
        <div className="cp-input"><input type="number" value={Math.round(hsl.l * 100)} min={0} max={100}
               onChange={e => onHslInput("l", e.target.value)} /></div>
        <div className="cp-input">
          <input type="number" value={Math.round(alpha * 100)} min={0} max={100}
                 onChange={e => onAlphaInput(e.target.value)} />
          <span className="cp-suffix">%</span>
        </div>
      </>
    );
  };

  return (
    <div ref={ref} className="popover cp-popover" style={{ left: pos.left, top: pos.top }}>
      {/* Header — close button so users have an explicit dismiss path
          (clicking outside still closes, but the X is more discoverable). */}
      <div className="cp-header">
        <span className="cp-title">{paintType === "solid" ? "Custom color" : paintType === "linear" ? "Linear gradient" : "Radial gradient"}</span>
        <button className="cp-close" onClick={onClose} title="Close">
          <Icon.Close size={12}/>
        </button>
      </div>
      {allowGradient && (
        <div className="cp-type-pill">
          {[["solid","Solid"],["linear","Linear"],["radial","Radial"]].map(([k, lbl]) => (
            <button key={k} className={paintType === k ? "on" : ""} onClick={() => switchType(k)}>{lbl}</button>
          ))}
        </div>
      )}
      {paintType !== "solid" && (
        <div className="cp-gradient-block">
          <div className="cp-stops-header">
            <span>Stops</span>
            <button className="cp-stop-add" title="Add stop"
                    onClick={() => {
                      // Add a stop in the middle of the largest gap so it's
                      // immediately visible.
                      const sorted = stops.slice().sort((a, b) => a.position - b.position);
                      let bestGap = 0, bestPos = 0.5;
                      for (let i = 0; i < sorted.length - 1; i++) {
                        const gap = sorted[i+1].position - sorted[i].position;
                        if (gap > bestGap) { bestGap = gap; bestPos = (sorted[i].position + sorted[i+1].position) / 2; }
                      }
                      addStop(bestPos);
                    }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <div ref={stopsBarRef} className="cp-stops-bar" onMouseDown={onBarClick}
               title="Click to add a stop · drag handles to position"
               style={{ backgroundImage: `linear-gradient(90deg, ${stops.slice().sort((a,b)=>a.position-b.position).map(s => `${hexToRgba(s.color, s.opacity ?? 1)} ${(s.position * 100).toFixed(2)}%`).join(", ")}), repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%)`,
                       backgroundSize: "100% 100%, 8px 8px" }}>
            {stops.map((s, i) => (
              <div key={i}
                   className={"cp-stop" + (i === selStopIdx ? " sel" : "")}
                   style={{ left: `${s.position * 100}%`, background: hexToRgba(s.color, s.opacity ?? 1) }}
                   onMouseDown={(e) => onStopDown(e, i)}
                   onDoubleClick={(e) => { e.stopPropagation(); removeStop(i); }}
                   title={`Drag to move · double-click to remove`}/>
            ))}
          </div>
          {/* Stops list — explicit row per stop with swatch + position + remove. */}
          <div className="cp-stops-list">
            {stops.map((s, i) => (
              <div key={i} className={"cp-stop-row" + (i === selStopIdx ? " sel" : "")}
                   onMouseDown={(e) => { if (!e.target.closest("input,button")) selectStop(i); }}>
                <span className="cp-stop-swatch" style={{ background: hexToRgba(s.color, s.opacity ?? 1) }}/>
                <span className="cp-stop-hex">{(s.color || "").replace("#", "").toUpperCase().slice(0, 6)}</span>
                <div className="cp-input cp-input-narrow">
                  <input type="number" min={0} max={100} value={Math.round((s.position ?? 0) * 100)}
                         onFocus={(e) => e.target.select()}
                         onChange={(e) => {
                           const v = clamp(parseFloat(e.target.value) || 0, 0, 100) / 100;
                           setStopPos(i, v);
                         }}/>
                  <span className="cp-suffix">%</span>
                </div>
                <button className="cp-stop-remove" title="Remove stop"
                        disabled={stops.length <= 2}
                        onClick={() => removeStop(i)}>
                  <Icon.Minus size={12}/>
                </button>
              </div>
            ))}
          </div>
          {paintType === "linear" && (
            <div className="cp-angle-row">
              <span className="cp-angle-label">Angle</span>
              <div className="cp-angle-knob"
                   role="slider" tabIndex={0}
                   aria-label="Gradient angle" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(angle)}
                   title="Drag to rotate · click input to type"
                   onMouseDown={(e) => {
                     e.preventDefault();
                     const knob = e.currentTarget;
                     const r = knob.getBoundingClientRect();
                     const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                     const move = (ev) => {
                       const t = ev.touches ? ev.touches[0] : ev;
                       const dx = t.clientX - cx, dy = t.clientY - cy;
                       // CSS linear-gradient angle: 0deg points UP. Rotate so the
                       // drag direction matches the resulting gradient direction.
                       let deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
                       deg = ((deg % 360) + 360) % 360;
                       setAngleEmit(deg);
                     };
                     const up = () => {
                       window.removeEventListener("mousemove", move);
                       window.removeEventListener("mouseup", up);
                       window.removeEventListener("touchmove", move);
                       window.removeEventListener("touchend", up);
                     };
                     window.addEventListener("mousemove", move);
                     window.addEventListener("mouseup", up);
                     window.addEventListener("touchmove", move, { passive: false });
                     window.addEventListener("touchend", up);
                     move(e);
                   }}>
                {/* Indicator needle rotated to current angle. The knob's own
                    icon is the dial outline; the line inside is the needle. */}
                <div className="cp-angle-needle" style={{ transform: `rotate(${angle}deg)` }} />
              </div>
              <div className="cp-input cp-input-narrow">
                <input type="number" value={Math.round(angle)} min={0} max={359}
                       onFocus={(e) => e.target.select()}
                       onChange={(e) => setAngleEmit(parseInt(e.target.value, 10) || 0)} />
                <span className="cp-suffix">°</span>
              </div>
            </div>
          )}
        </div>
      )}
      {/* SV area */}
      <div ref={svRef} className="cp-sv" onMouseDown={onSvDown} onTouchStart={onSvDown}
           style={{ background: hueColor }}>
        <div className="cp-sv-white" />
        <div className="cp-sv-black" />
        <div className="cp-sv-handle"
             style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: pureRgb }} />
      </div>

      {/* Hue + Alpha sliders with eyedropper */}
      <div className="cp-sliders">
        <button className="cp-eyedrop" onClick={pickEyedropper}
                disabled={typeof window.EyeDropper !== "function"}
                title={typeof window.EyeDropper === "function" ? "Pick a color" : "Eyedropper not supported"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 22 1-1h3l9-9"/>
            <path d="M3 21v-3l9-9"/>
            <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>
          </svg>
        </button>
        <div className="cp-slider-stack">
          <div ref={hueRef} className="cp-hue" onMouseDown={onHueDown} onTouchStart={onHueDown}>
            <div className="cp-hue-handle" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }} />
          </div>
          <div ref={alphaRef} className="cp-alpha" onMouseDown={onAlphaDown} onTouchStart={onAlphaDown}>
            <div className="cp-alpha-fill" style={{ background: `linear-gradient(to right, rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},0), ${pureRgb})` }} />
            <div className="cp-alpha-handle" style={{ left: `${alpha * 100}%`, background: `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${alpha})` }} />
          </div>
        </div>
      </div>

      {/* Mode selector + numeric inputs */}
      <div className="cp-fields">
        <div className="cp-mode" onClick={() => setModeOpen(v => !v)}>
          <span>{mode}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6"/>
          </svg>
          {modeOpen && (
            <div className="cp-mode-menu" onMouseDown={e => e.stopPropagation()}>
              {["HEX","RGB","HSL"].map(m => (
                <div key={m} className={m === mode ? "on" : ""}
                     onClick={(e) => { e.stopPropagation(); setMode(m); setModeOpen(false); }}>{m}</div>
              ))}
            </div>
          )}
        </div>
        {renderInputs()}
      </div>

      {/* Favorite swatches */}
      <div className="cp-favs">
        <div className="cp-favs-header">
          <span>Swatches</span>
          <button className="cp-fav-add" onClick={addFavorite} title="Save current color">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
        {favorites.length === 0 ? (
          <div className="cp-favs-empty">Click + to save the current color</div>
        ) : (
          <div className="cp-favs-grid">
            {favorites.map((f, i) => (
              <button key={`${f.color}-${i}`} className="cp-fav"
                      title={`${f.color} · alt-click to remove`}
                      onClick={(e) => {
                        if (e.altKey) { removeFavorite(i); return; }
                        applyFavorite(f);
                      }}
                      onContextMenu={(e) => { e.preventDefault(); removeFavorite(i); }}>
                <span className="cp-fav-swatch"
                      style={{ backgroundColor: f.color }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Sections -----

function Section({ title, children, add, onAdd, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="insp-section">
      <div className="insp-section-header">
        <span onClick={() => setOpen(!open)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          {title}
        </span>
        {add && <div className="actions">
          <button className="icon-btn" onClick={onAdd}><Icon.Plus size={16}/></button>
        </div>}
      </div>
      {open && children}
    </div>
  );
}

// Map our node-level textCase enum onto a CSS text-transform value.
function textCaseToTransform(c) {
  return c === "upper" ? "uppercase"
       : c === "lower" ? "lowercase"
       : c === "title" ? "capitalize"
                       : "none";
}

// Measure text with given style; returns {w, h}
function measureText(text, { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, maxWidth, textTransform }) {
  if (!window.__textMeasurer) {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px;padding:0;margin:0;border:0;";
    document.body.appendChild(el);
    window.__textMeasurer = el;
  }
  const el = window.__textMeasurer;
  el.style.fontFamily = fontFamily || "Inter";
  el.style.fontSize = (fontSize || 16) + "px";
  el.style.fontWeight = fontWeight || 400;
  el.style.lineHeight = lineHeight || 1.25;
  el.style.letterSpacing = letterSpacing || "normal";
  el.style.textTransform = textTransform || "none";
  el.style.whiteSpace = maxWidth ? "pre-wrap" : "pre";
  el.style.wordWrap = maxWidth ? "break-word" : "normal";
  el.style.width = maxWidth ? (maxWidth + "px") : "auto";
  el.innerText = text || "";
  return { w: el.scrollWidth + 1, h: el.scrollHeight };
}
window.measureText = measureText;

// Given a text node + a proposed typography patch, return the patch with
// w/h recomputed based on the node's sizing mode.
function remeasureText(node, patch) {
  const merged = { ...node, ...patch };
  const mode = merged.sizingMode || "auto-h";
  if (mode === "fixed") return patch;
  const styleArgs = {
    fontFamily: merged.fontFamily,
    fontSize: merged.fontSize,
    fontWeight: merged.fontWeight,
    lineHeight: lineHeightCss(merged),
    letterSpacing: merged.letterSpacing,
    textTransform: textCaseToTransform(merged.textCase),
    maxWidth: mode === "auto-h" ? merged.w : null,
  };
  const m = measureText(merged.text || "", styleArgs);
  if (mode === "auto-wh") return { ...patch, w: m.w, h: m.h };
  return { ...patch, h: m.h };
}

// Free-typing hex input — keeps a local draft so the user can type/paste
// anything (with or without `#`, 3-digit shorthand OK). Commits to parent
// only when the draft parses to a valid 6-digit hex. On blur, snaps the
// display back to the committed color if the draft is garbage.
function HexInput({ value, onChange }) {
  const [draft, setDraft] = useState((value || "").replace("#", "").toUpperCase());
  const lastCommit = useRef((value || "").toUpperCase());
  useEffect(() => {
    const up = (value || "").toUpperCase();
    if (up !== lastCommit.current) {
      lastCommit.current = up;
      setDraft(up.replace("#", ""));
    }
  }, [value]);
  const tryCommit = (raw) => {
    let v = raw.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split("").map(c => c + c).join("");
    if (/^[0-9a-fA-F]{6}$/.test(v)) {
      const hex = "#" + v.toUpperCase();
      lastCommit.current = hex;
      onChange(hex);
      return true;
    }
    return false;
  };
  return (
    <input
      className="hex-input"
      value={draft}
      spellCheck={false}
      onFocus={e => e.target.select()}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9a-fA-F#]/g, "").slice(0, 7);
        setDraft(v.replace(/^#/, "").toUpperCase());
        tryCommit(v);
      }}
      onPaste={e => {
        const txt = (e.clipboardData || window.clipboardData).getData("text");
        if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(txt.trim())) {
          e.preventDefault();
          let v = txt.trim().replace(/^#/, "");
          if (v.length === 3) v = v.split("").map(c => c + c).join("");
          setDraft(v.toUpperCase());
          tryCommit(v);
        }
      }}
      onBlur={() => {
        if (!tryCommit(draft)) setDraft(lastCommit.current.replace("#", ""));
      }}
      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

// Letter-spacing input. Always persists as a CSS px string ("0.2px") so the
// renderer doesn't need to know about display units. The "%" unit is a UI
// affordance only — we use the convention 1% = 0.2px (Figma-style mapping
// when working at a 20px reference font size).
function LetterSpacingInput({ node, onChange }) {
  const unit = node.letterSpacingUnit || "%";
  const raw = node.letterSpacing;
  // Always normalize the stored value to px. Legacy values stored as "em"
  // are converted using the current font-size so existing docs keep their
  // look on first open.
  const px = (() => {
    if (raw == null || raw === "") return 0;
    const s = String(raw).trim();
    const m = s.match(/^(-?\d+(?:\.\d+)?)/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    if (s.endsWith("em")) return n * (node.fontSize || 16);
    return n;
  })();
  // Display value depends on selected unit. 1% = 0.2px. Negative values supported.
  const value = unit === "%" ? Math.round(px / 0.2) : Math.round(px * 10) / 10;
  // Local draft lets the user type intermediate states like "-" or "-." before
  // the field commits a number. Otherwise typing "-5" would snap to 0 on the
  // first keystroke.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (v) => {
    const n = parseFloat(v);
    const safe = isFinite(n) ? n : 0;
    const newPx = unit === "%" ? safe * 0.2 : safe;
    onChange({
      letterSpacing: newPx === 0 ? null : newPx + "px",
      letterSpacingUnit: unit,
    });
  };
  const cycleUnit = () => {
    const next = unit === "%" ? "px" : "%";
    onChange({ letterSpacingUnit: next });
  };
  return (
    <div className="input-wrap" style={{ flex: 1 }}>
      <span className="prefix"><Icon.LetterSpacing size={13}/></span>
      <input type="number" value={draft} step={unit === "%" ? 1 : 0.1}
             onChange={e => {
               setDraft(e.target.value);
               // Commit only when the draft parses to a finite number.
               // Drafts like "" or "-" are preserved for further typing.
               if (e.target.value !== "" && e.target.value !== "-" && e.target.value !== "-.") {
                 const n = parseFloat(e.target.value);
                 if (isFinite(n)) commit(n);
               }
             }}
             onBlur={() => commit(draft)} />
      <span className="suffix lh-unit" onClick={cycleUnit} title="Toggle unit (% / px)">
        {unit}
      </span>
    </div>
  );
}

// Advanced text-settings popover (opens from the sliders icon).
// Houses settings that don't fit in the main Typography row: text decoration,
// case transform, paragraph spacing, truncate, etc.
function TextSettingsPopover({ node, anchor, onChange, onClose }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const click = (e) => { if (!ref.current?.contains(e.target)) onCloseRef.current?.(); };
    const t = setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", click); };
  }, []);

  const decoration = node.textDecoration || "none";  // none / underline / strike
  const textCase   = node.textCase || "none";        // none / upper / lower / title
  const paraSpace  = node.paragraphSpacing || 0;
  const truncate   = node.truncate || false;

  // Position to the LEFT of the right inspector panel so the popover never
  // covers the inspector that triggered it.
  const POPOVER_W = 248;
  const POPOVER_H_ESTIMATE = 280;
  const getRightPanelLeft = () =>
    document.querySelector(".right-panel")?.getBoundingClientRect().left ?? window.innerWidth - 260;
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, getRightPanelLeft() - POPOVER_W - 8),
    top:  Math.max(8, Math.min((anchor?.y ?? 0) - POPOVER_H_ESTIMATE / 2 + 12, window.innerHeight - POPOVER_H_ESTIMATE - 8)),
  }));
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reposition = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const left = Math.max(8, getRightPanelLeft() - w - 8);
      let top = (anchor?.y ?? 0) - h / 2 + 12; // center the popover on the trigger row
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      setPos({ left, top });
    };
    reposition();
    // Re-clamp whenever the popover's size changes (e.g. user toggles
    // a section, adds a row, etc.) so it never gets clipped off-screen.
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor?.x, anchor?.y]);

  return (
    <div ref={ref} className="text-settings-popover"
         style={{
           position: "fixed",
           left: pos.left,
           top: pos.top,
           width: POPOVER_W,
           background: "var(--toolbar-bg)",
           border: "1px solid var(--app-border)",
           borderRadius: 10,
           padding: 12,
           boxShadow: "0 8px 24px rgba(0,0,0,.25)",
           zIndex: 500,
         }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-fg)" }}>Type setting</div>
        <button className="icon-btn" onClick={onClose}><Icon.Close size={12}/></button>
      </div>

      {/* Decoration row */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Decoration</span>
        <div className="toggle-pill">
          <button title="None"
                  className={decoration === "none" ? "on" : ""}
                  onClick={() => onChange({ textDecoration: "none" })}>—</button>
          <button title="Underline"
                  className={decoration === "underline" ? "on" : ""}
                  onClick={() => onChange({ textDecoration: "underline" })}>
            <Icon.Underline size={12}/>
          </button>
          <button title="Strikethrough"
                  className={decoration === "strike" ? "on" : ""}
                  onClick={() => onChange({ textDecoration: "strike" })}>
            <Icon.Strike size={12}/>
          </button>
        </div>
      </div>

      {/* Case row */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Case</span>
        <div className="toggle-pill">
          <button title="None" className={textCase === "none" ? "on" : ""}
                  onClick={() => onChange({ textCase: "none" })}>—</button>
          <button title="UPPERCASE" className={textCase === "upper" ? "on" : ""}
                  onClick={() => onChange({ textCase: "upper" })}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>AG</span>
          </button>
          <button title="lowercase" className={textCase === "lower" ? "on" : ""}
                  onClick={() => onChange({ textCase: "lower" })}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>ag</span>
          </button>
          <button title="Title Case" className={textCase === "title" ? "on" : ""}
                  onClick={() => onChange({ textCase: "title" })}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Ag</span>
          </button>
        </div>
      </div>

      {/* Paragraph spacing */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Paragraph spacing</span>
        <div style={{ flex: 1, maxWidth: 96 }}>
          <NumInput value={paraSpace} min={0} onChange={v => onChange({ paragraphSpacing: v })} suffix="px"/>
        </div>
      </div>

      {/* Truncate text */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Truncate text</span>
        <div className="toggle-pill">
          <button title="Off" className={!truncate ? "on" : ""}
                  onClick={() => onChange({ truncate: false })}>—</button>
          <button title="Truncate" className={truncate ? "on" : ""}
                  onClick={() => onChange({
                    truncate: true,
                    // Seed Max lines with 1 the first time the user toggles
                    // truncation on — otherwise the visual effect can be
                    // invisible (auto-fit only kicks in for Fixed sizing).
                    ...(node.truncateLines ? null : { truncateLines: 1 }),
                  })}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>A…</span>
          </button>
        </div>
      </div>
      {/* Max lines — only meaningful when Truncate is on. Leaving the value
          at 0 falls back to "fit as many lines as the box height allows". */}
      {truncate && (
        <div style={settingsRowStyle}>
          <span style={settingsLabelStyle}>Max lines</span>
          <div style={{ flex: 1, maxWidth: 96 }}>
            <NumInput value={node.truncateLines || 0} min={0}
                      onChange={v => onChange({ truncateLines: v > 0 ? v : null })}
                      suffix={node.truncateLines > 0 ? "" : "auto"}/>
          </div>
        </div>
      )}
    </div>
  );
}

const settingsRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "2px 0",
  marginBottom: "var(--ui-gap-row)",
};
const settingsLabelStyle = {
  fontSize: 11,
  color: "var(--app-fg-2)",
  flex: 1,
};

// Width-profile previews — small SVGs shown inside the Stroke-settings
// dropdown. Each one represents a variable-width stroke shape.
const WIDTH_PROFILES = [
  { id: "uniform", label: "Uniform",
    svg: <rect x="2" y="9" width="116" height="6" rx="0.5" fill="currentColor"/> },
  { id: "taper-r", label: "Tapered right",
    svg: <polygon points="2,9 118,11.5 118,12.5 2,15" fill="currentColor"/> },
  { id: "taper-l", label: "Tapered left",
    svg: <polygon points="2,11.5 118,9 118,15 2,12.5" fill="currentColor"/> },
  { id: "swell",   label: "Center swell",
    svg: <path d="M2 11.5 Q60 8, 118 11.5 L118 12.5 Q60 16, 2 12.5 Z" fill="currentColor"/> },
  { id: "lens",    label: "Lens",
    svg: <path d="M2 12 Q60 6, 118 12 Q60 18, 2 12 Z" fill="currentColor"/> },
  { id: "pointed", label: "Pointed lens",
    svg: <path d="M2 12 Q60 4, 118 12 Q60 20, 2 12 Z" fill="currentColor"/> },
];

// Custom dropdown — renders the current width-profile SVG inline, opens a list
// of all profile previews on click. Uses position: fixed for the popup so it
// can escape the parent popover's clipping and stay in the viewport.
function WidthProfilePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState({ left: 0, top: 0, flipUp: false });
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const POP_W = 220;
  const POP_H_ESTIMATE = 260;
  useEffect(() => {
    if (!open) return;
    // Measure trigger, decide direction (flip up if not enough room below).
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const flipUp = spaceBelow < POP_H_ESTIMATE && r.top > POP_H_ESTIMATE;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - POP_W - 8);
      const top = flipUp ? Math.max(8, r.top - POP_H_ESTIMATE - 4)
                         : Math.min(r.bottom + 4, window.innerHeight - POP_H_ESTIMATE - 8);
      setPopPos({ left, top, flipUp });
    }
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  const current = WIDTH_PROFILES.find(p => p.id === value) || WIDTH_PROFILES[0];
  return (
    <div ref={ref} style={{ position: "relative", flex: "0 0 108px" }}>
      <div ref={triggerRef} className="input-wrap" onClick={() => setOpen(!open)}
           style={{ cursor: "pointer", justifyContent: "space-between", padding: "0 6px" }}>
        <svg width="80" height="20" viewBox="0 0 120 24" style={{ color: "var(--app-fg)" }}>
          {current.svg}
        </svg>
        <span className="suffix"><Icon.Chevron size={10}/></span>
      </div>
      {open && (
        <div style={{
          position: "fixed",
          left: popPos.left,
          top: popPos.top,
          zIndex: 700,
          background: "var(--app-panel)", border: "1px solid var(--app-border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          padding: 4, width: POP_W,
        }}>
          {WIDTH_PROFILES.map(p => {
            const selected = p.id === value;
            return (
              <div key={p.id}
                   onClick={() => { onChange(p.id); setOpen(false); }}
                   style={{
                     display: "flex", alignItems: "center", gap: 8,
                     padding: "6px 8px", cursor: "pointer", borderRadius: 4,
                     background: selected ? "var(--accent)" : "transparent",
                     color: selected ? "#fff" : "var(--app-fg)",
                   }}
                   onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--app-hover)"; }}
                   onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ flex: "none", opacity: selected ? 1 : 0 }}>
                  <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <svg width="150" height="20" viewBox="0 0 120 24" style={{ color: selected ? "#fff" : "var(--app-fg)" }}>
                  {p.svg}
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Per-side stroke width editor — opened from the "Individual sides"
// button in the Stroke section. Lets users set Top / Right / Bottom / Left
// independently. When the object is unset, all four mirror stroke.weight.
function IndividualSidesPopover({ stroke, anchor, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const click = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const t = setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", click); };
  }, [onClose]);

  const POPOVER_W = 220;
  const POPOVER_H_ESTIMATE = 200;
  const getRightPanelLeft = () =>
    document.querySelector(".right-panel")?.getBoundingClientRect().left ?? window.innerWidth - 260;
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, getRightPanelLeft() - POPOVER_W - 8),
    top:  Math.max(8, Math.min((anchor?.y ?? 0) - POPOVER_H_ESTIMATE / 2 + 12, window.innerHeight - POPOVER_H_ESTIMATE - 8)),
  }));
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reposition = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const left = Math.max(8, getRightPanelLeft() - w - 8);
      let top = (anchor?.y ?? 0) - h / 2 + 12; // center the popover on the trigger row
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      setPos({ left, top });
    };
    reposition();
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor?.x, anchor?.y]);

  // Resolve current sides — falling back to the uniform weight when an
  // individual side isn't set.
  const uniform = stroke.weight ?? 1;
  const sides = {
    t: stroke.widths?.t ?? uniform,
    r: stroke.widths?.r ?? uniform,
    b: stroke.widths?.b ?? uniform,
    l: stroke.widths?.l ?? uniform,
  };
  const allEqual = sides.t === sides.r && sides.r === sides.b && sides.b === sides.l;
  const [linked, setLinked] = useState(allEqual);
  const setSide = (k, v) => {
    const next = { ...sides, [k]: Math.max(0, parseFloat(v) || 0) };
    if (linked) {
      // Mirror the typed value across all four; also clear individual
      // widths and set the uniform weight to keep the model simple.
      const w = next[k];
      onChange({ weight: w, widths: null });
    } else {
      onChange({ widths: next });
    }
  };
  const toggleLinked = () => {
    if (!linked) {
      // Switching back to uniform — collapse to a single weight (uses top).
      onChange({ weight: sides.t, widths: null });
    } else {
      // Switching to per-side — seed widths from current uniform weight.
      onChange({ widths: { ...sides } });
    }
    setLinked(!linked);
  };

  const SideInput = ({ side, value }) => (
    <div className="input-wrap individual-side-input">
      <input type="number" min={0} value={Math.round(value * 100) / 100}
             onFocus={(e) => e.target.select()}
             onChange={(e) => setSide(side, e.target.value)}/>
    </div>
  );

  return (
    <div ref={ref} className="text-settings-popover"
         style={{
           position: "fixed",
           left: pos.left,
           top: pos.top,
           width: POPOVER_W,
           background: "var(--toolbar-bg)",
           border: "1px solid var(--app-border)",
           borderRadius: 10,
           padding: 12,
           boxShadow: "0 8px 24px rgba(0,0,0,.25)",
           zIndex: 500,
         }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-fg)" }}>Individual sides</div>
        <button className="icon-btn" onClick={onClose}><Icon.Close size={12}/></button>
      </div>
      {/* Cross-layout grid: a thumbnail in the center with four sides around it. */}
      <div className="individual-sides-grid">
        <div/>
        <SideInput side="t" value={sides.t}/>
        <div/>
        <SideInput side="l" value={sides.l}/>
        <button className={"individual-link" + (linked ? " on" : "")}
                title={linked ? "Unlink sides" : "Link all sides"}
                onClick={toggleLinked}>
          <Icon.Link size={14}/>
        </button>
        <SideInput side="r" value={sides.r}/>
        <div/>
        <SideInput side="b" value={sides.b}/>
        <div/>
      </div>
    </div>
  );
}

// Advanced stroke-settings popover. Houses Style (solid/dashed/dotted),
// Width profile, and Join. Modeled after TextSettingsPopover.
function StrokeSettingsPopover({ stroke, anchor, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const click = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [onClose]);

  const style = stroke.style || "solid";
  const join  = stroke.join  || "miter";
  const widthProfile = stroke.widthProfile || "uniform";

  // Smart positioning — anchor to the LEFT of the right inspector panel, not
  // to the button. That way the popover is always in the canvas area.
  const POPOVER_W = 248;
  const POPOVER_H_ESTIMATE = 220;
  const getRightPanelLeft = () =>
    document.querySelector(".right-panel")?.getBoundingClientRect().left ?? window.innerWidth - 260;
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, getRightPanelLeft() - POPOVER_W - 8),
    top:  Math.max(8, Math.min((anchor?.y ?? 0) - POPOVER_H_ESTIMATE / 2 + 12, window.innerHeight - POPOVER_H_ESTIMATE - 8)),
  }));
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reposition = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const left = Math.max(8, getRightPanelLeft() - w - 8);
      let top = (anchor?.y ?? 0) - h / 2 + 12; // center the popover on the trigger row
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      setPos({ left, top });
    };
    reposition();
    // Re-clamp whenever the popover's size changes (e.g. user toggles
    // a section, adds a row, etc.) so it never gets clipped off-screen.
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor?.x, anchor?.y]);

  return (
    <div ref={ref} className="text-settings-popover"
         style={{
           position: "fixed",
           left: pos.left,
           top: pos.top,
           width: POPOVER_W,
           background: "var(--toolbar-bg)",
           border: "1px solid var(--app-border)",
           borderRadius: 10,
           padding: 12,
           boxShadow: "0 8px 24px rgba(0,0,0,.25)",
           zIndex: 500,
         }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-fg)" }}>Stroke settings</div>
        <button className="icon-btn" onClick={onClose}><Icon.Close size={12}/></button>
      </div>

      {/* Style dropdown */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Style</span>
        <SelectMenu value={style} onChange={v => onChange({ style: v })} flex="0 0 140px"
          options={[
            { v: "solid", label: "— Solid" },
            { v: "dashed", label: "- - Dashed" },
            { v: "dotted", label: "··· Dotted" },
          ]}/>
      </div>

      {/* Width profile */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Width profile</span>
        <WidthProfilePicker value={widthProfile}
                            onChange={v => onChange({ widthProfile: v })}/>
        <button className="paint-action" title="Flip width profile" style={{ marginLeft: 6 }}>
          <Icon.FlipHandle size={16}/>
        </button>
      </div>

      {/* Join — 3 buttons */}
      <div style={settingsRowStyle}>
        <span style={settingsLabelStyle}>Join</span>
        <div className="toggle-pill" style={{ flex: "0 0 140px" }}>
          <button title="Miter join" className={join === "miter" ? "on" : ""}
                  onClick={() => onChange({ join: "miter" })} style={{ flex: 1 }}>
            <Icon.JoinMiter size={14}/>
          </button>
          <button title="Round join" className={join === "round" ? "on" : ""}
                  onClick={() => onChange({ join: "round" })} style={{ flex: 1 }}>
            <Icon.JoinRound size={14}/>
          </button>
          <button title="Bevel join" className={join === "bevel" ? "on" : ""}
                  onClick={() => onChange({ join: "bevel" })} style={{ flex: 1 }}>
            <Icon.JoinBevel size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

// Default values for each effect type — used when the user creates a new
// effect or switches an existing one to a different type.
const EFFECT_DEFAULTS = {
  "drop-shadow":     { type: "drop-shadow",     x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.15, visible: true },
  "inner-shadow":    { type: "inner-shadow",    x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.15, visible: true },
  "layer-blur":      { type: "layer-blur",      blur: 8,                                                          visible: true },
  "background-blur": { type: "background-blur", blur: 16,                                                         visible: true },
  "noise":           { type: "noise",           opacity: 0.18, scale: 1,                                          visible: true },
  "glass":           { type: "glass",           blur: 18, tintColor: "#FFFFFF", tintOpacity: 0.18,                visible: true },
};
window.EFFECT_DEFAULTS = EFFECT_DEFAULTS;
const EFFECT_LABELS = {
  "drop-shadow":     "Drop shadow",
  "inner-shadow":    "Inner shadow",
  "layer-blur":      "Layer blur",
  "background-blur": "Background blur",
  "noise":           "Noise",
  "glass":           "Glass",
};

// Floating editor for a single effect. Supports drop/inner shadow,
// layer/background blur, noise texture, and glass (frosted) — switchable
// via the type dropdown at the top.
function EffectsPopover({ shadow, anchor, onChange, onClose, onOpenColor }) {
  const ref = useRef(null);
  useEffect(() => {
    const click = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [onClose]);

  const effectType = shadow.type || "drop-shadow";
  // When the user picks a new type, replace the whole object with that
  // type's defaults so we don't carry stale fields between types.
  const setType = (t) => {
    if (t === effectType) return;
    onChange({ ...EFFECT_DEFAULTS[t], visible: shadow.visible !== false }, /* replace */ true);
  };
  const EFFECT_ICONS = {
    "drop-shadow":     Icon.FxDropShadow,
    "inner-shadow":    Icon.FxInnerShadow,
    "layer-blur":      Icon.FxLayerBlur,
    "background-blur": Icon.FxBackgroundBlur,
    "noise":           Icon.FxNoise,
    "glass":           Icon.FxGlass,
  };
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [typeMenuFlip, setTypeMenuFlip] = useState(false); // open upward when no room below
  const typeMenuRef = useRef(null);
  const typeMenuListRef = useRef(null);
  useEffect(() => {
    if (!typeMenuOpen) return;
    const click = (e) => { if (!typeMenuRef.current?.contains(e.target)) setTypeMenuOpen(false); };
    const t = setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", click); };
  }, [typeMenuOpen]);
  // Decide whether to open the menu downward (default) or upward based on
  // available space. Runs synchronously after render so we never flash the
  // menu in the wrong direction.
  useLayoutEffect(() => {
    if (!typeMenuOpen || !typeMenuRef.current || !typeMenuListRef.current) return;
    const trigger = typeMenuRef.current.getBoundingClientRect();
    const menuH = typeMenuListRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - trigger.bottom - 8;
    setTypeMenuFlip(spaceBelow < menuH && trigger.top > spaceBelow);
  }, [typeMenuOpen]);

  // Smart positioning — anchor to the LEFT of the right inspector panel.
  const POPOVER_W = 248;
  const POPOVER_H_ESTIMATE = 260;
  const getRightPanelLeft = () =>
    document.querySelector(".right-panel")?.getBoundingClientRect().left ?? window.innerWidth - 260;
  const [pos, setPos] = useState(() => ({
    left: Math.max(8, getRightPanelLeft() - POPOVER_W - 8),
    top:  Math.max(8, Math.min((anchor?.y ?? 0) - POPOVER_H_ESTIMATE / 2 + 12, window.innerHeight - POPOVER_H_ESTIMATE - 8)),
  }));
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reposition = () => {
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const left = Math.max(8, getRightPanelLeft() - w - 8);
      let top = (anchor?.y ?? 0) - h / 2 + 12; // center the popover on the trigger row
      if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
      if (top < 8) top = 8;
      setPos({ left, top });
    };
    reposition();
    // Re-clamp whenever the popover's size changes (e.g. user toggles
    // a section, adds a row, etc.) so it never gets clipped off-screen.
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor?.x, anchor?.y]);

  return (
    <div ref={ref} className="effects-popover"
         style={{
           position: "fixed",
           left: pos.left,
           top: pos.top,
           width: POPOVER_W,
           background: "var(--toolbar-bg)",
           border: "1px solid var(--app-border)",
           borderRadius: 10,
           padding: 12,
           boxShadow: "0 8px 24px rgba(0,0,0,.25)",
           zIndex: 500,
         }}>
      {/* Header — effect type dropdown + close */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div ref={typeMenuRef} className="effects-type-select" style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
          <button className="effects-type-trigger"
                  onClick={() => setTypeMenuOpen(o => !o)}
                  style={{ width: "100%" }}>
            {(() => {
              const TypeIcon = EFFECT_ICONS[effectType];
              return <TypeIcon size={14}/>;
            })()}
            <span style={{ flex: 1, textAlign: "left" }}>{EFFECT_LABELS[effectType]}</span>
            <Icon.Chevron size={10}/>
          </button>
          {typeMenuOpen && (
            <div ref={typeMenuListRef}
                 className={"effects-type-menu" + (typeMenuFlip ? " flip-up" : "")}>
              {Object.keys(EFFECT_LABELS).map(k => {
                const TypeIcon = EFFECT_ICONS[k];
                return (
                  <div key={k}
                       className={"effects-type-option" + (k === effectType ? " on" : "")}
                       onClick={() => { setType(k); setTypeMenuOpen(false); }}>
                    <TypeIcon size={14}/>
                    <span>{EFFECT_LABELS[k]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button className="paint-action" title="Close" onClick={onClose}><Icon.Close size={14}/></button>
      </div>

      {(effectType === "drop-shadow" || effectType === "inner-shadow") && (
        <>
          <div style={effectsRowStyle}>
            <span style={effectsLabelStyle}>Position</span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--ui-gap-row)", alignItems: "stretch" }}>
              <NumInput prefix="X" value={shadow.x ?? 0} style={{ flex: "0 0 var(--ui-h-md)" }} onChange={v => onChange({ x: v })}/>
              <NumInput prefix="Y" value={shadow.y ?? 0} style={{ flex: "0 0 var(--ui-h-md)" }} onChange={v => onChange({ y: v })}/>
            </div>
          </div>
          <div style={effectsRowStyle}>
            <span style={effectsLabelStyle}>Blur</span>
            <div style={{ flex: 1 }}>
              <NumInput prefix={<Icon.BlurDots size={13}/>} value={shadow.blur ?? 0} min={0}
                        onChange={v => onChange({ blur: v })}/>
            </div>
          </div>
          <div style={effectsRowStyle}>
            <span style={effectsLabelStyle}>Spread</span>
            <div style={{ flex: 1 }}>
              <NumInput prefix={<Icon.Spread size={13}/>} value={shadow.spread ?? 0}
                        onChange={v => onChange({ spread: v })}/>
            </div>
          </div>
          <div style={{ ...effectsRowStyle, borderBottom: "none" }}>
            <span style={effectsLabelStyle}>Color</span>
            <div style={{ flex: 1 }}>
              <div className="fill-row effects-color-row">
                <div className="swatch" onClick={onOpenColor}>
                  <div className="swatch-fill" style={{ background: hexToRgba(shadow.color, shadow.opacity ?? 1) }}/>
                </div>
                <HexInput value={shadow.color}
                       onChange={hex => onChange({ color: hex })} />
                <div className="opacity-field">
                  <input type="number" value={Math.round((shadow.opacity ?? 1)*100)} min={0} max={100}
                         onFocus={e => e.target.select()}
                         onChange={e => onChange({ opacity: Math.max(0, Math.min(100, parseFloat(e.target.value)||0))/100 })} />
                  <span className="suffix">%</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {(effectType === "layer-blur" || effectType === "background-blur") && (
        <>
          <div style={{ ...effectsRowStyle, borderBottom: "none" }}>
            <span style={effectsLabelStyle}>Blur</span>
            <div style={{ flex: 1 }}>
              <NumInput prefix={<Icon.BlurDots size={13}/>} value={shadow.blur ?? 0} min={0}
                        onChange={v => onChange({ blur: v })}/>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--app-fg-3)", lineHeight: 1.4, marginTop: 4 }}>
            {effectType === "layer-blur"
              ? "Blurs the layer itself."
              : "Blurs whatever is behind this layer — most visible when the fill is semi-transparent."}
          </div>
        </>
      )}

      {effectType === "noise" && (
        <>
          <div style={effectsRowStyle}>
            <span style={effectsLabelStyle}>Amount</span>
            <div style={{ flex: 1 }}>
              <div className="opacity-field" style={{ width: "100%" }}>
                <input type="number" value={Math.round((shadow.opacity ?? 0)*100)} min={0} max={100}
                       onFocus={e => e.target.select()}
                       onChange={e => onChange({ opacity: Math.max(0, Math.min(100, parseFloat(e.target.value)||0))/100 })} />
                <span className="suffix">%</span>
              </div>
            </div>
          </div>
          <div style={{ ...effectsRowStyle, borderBottom: "none" }}>
            <span style={effectsLabelStyle}>Scale</span>
            <div style={{ flex: 1 }}>
              <NumInput value={shadow.scale ?? 1} min={0.25} step={0.25}
                        onChange={v => onChange({ scale: Math.max(0.25, v) })}/>
            </div>
          </div>
        </>
      )}

      {effectType === "glass" && (
        <>
          <div style={effectsRowStyle}>
            <span style={effectsLabelStyle}>Blur</span>
            <div style={{ flex: 1 }}>
              <NumInput prefix={<Icon.BlurDots size={13}/>} value={shadow.blur ?? 0} min={0}
                        onChange={v => onChange({ blur: v })}/>
            </div>
          </div>
          <div style={{ ...effectsRowStyle, borderBottom: "none" }}>
            <span style={effectsLabelStyle}>Tint</span>
            <div style={{ flex: 1 }}>
              <div className="fill-row effects-color-row">
                <div className="swatch" onClick={onOpenColor}>
                  <div className="swatch-fill" style={{ background: hexToRgba(shadow.tintColor || "#FFFFFF", shadow.tintOpacity ?? 0.18) }}/>
                </div>
                <HexInput value={shadow.tintColor || "#FFFFFF"}
                       onChange={hex => onChange({ tintColor: hex })} />
                <div className="opacity-field">
                  <input type="number" value={Math.round((shadow.tintOpacity ?? 0.18)*100)} min={0} max={100}
                         onFocus={e => e.target.select()}
                         onChange={e => onChange({ tintOpacity: Math.max(0, Math.min(100, parseFloat(e.target.value)||0))/100 })} />
                  <span className="suffix">%</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const effectsRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "2px 0",
  marginBottom: "var(--ui-gap-row)",
};
const effectsLabelStyle = {
  fontSize: 11,
  color: "var(--app-fg-2)",
  flex: "0 0 54px",
  paddingTop: 6,
};

// Line-height input with a clickable unit toggle (Auto → px → % → Auto).
// In Auto mode the field shows the resolved pixel value as a hint; typing a
// number snaps to px mode. In px/% the value persists; clicking the suffix
// cycles to the next unit and converts the value using current font size.
function LineHeightInput({ node, onChange }) {
  const unit = node.lineHeightUnit || (node.lineHeight ? "%" : "auto");
  const fontSize = node.fontSize || 16;
  const autoPx = Math.round(fontSize * 1.2); // browser "normal" ≈ 1.2× for most fonts

  const value = (() => {
    if (unit === "auto") return autoPx;
    if (unit === "px") return Math.round(node.lineHeight ?? autoPx);
    if (unit === "%") return Math.round(node.lineHeight ?? 120);
    return Math.round((node.lineHeight ?? 1.2) * 100);
  })();

  const setValue = (raw) => {
    const n = parseFloat(raw);
    if (!isFinite(n)) return;
    // Typing while in Auto promotes to px mode.
    onChange({ lineHeight: n, lineHeightUnit: unit === "auto" ? "px" : unit });
  };
  const cycleUnit = () => {
    if (unit === "auto") {
      // Auto → px: lock at the auto-resolved value
      onChange({ lineHeight: autoPx, lineHeightUnit: "px" });
    } else if (unit === "px") {
      const pct = Math.round((value / fontSize) * 100);
      onChange({ lineHeight: pct, lineHeightUnit: "%" });
    } else {
      // % → Auto: drop the explicit value
      onChange({ lineHeight: null, lineHeightUnit: "auto" });
    }
  };

  return (
    <div className={"input-wrap" + (unit === "auto" ? " lh-auto" : "")} style={{ flex: 1 }}>
      <span className="prefix"><Icon.LineHeight size={13}/></span>
      <input type="number" value={value} min={0} step={1}
             onChange={e => setValue(e.target.value)} />
      <span className="suffix lh-unit" onClick={cycleUnit}
            title="Toggle line-height unit (Auto / px / %)">
        {unit === "auto" ? "Auto" : unit}
      </span>
    </div>
  );
}

// Font-size input with a preset dropdown. Acts like NumInput (scrub prefix,
// arithmetic expressions, ↑/↓ steps) but adds a chevron that opens a list of
// common sizes for quick selection.
const FONT_SIZE_PRESETS = [10, 11, 12, 13, 14, 15, 16, 20, 24, 32, 36, 40, 48, 64, 96, 128];
function FontSizeInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", flex: 1, display: "flex", minWidth: 0 }}>
      <NumInput prefix="Aa" value={value} min={1} onChange={onChange}
                suffix={
                  <span onClick={() => setOpen(!open)} style={{ cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <Icon.ChevronR size={9} style={{ transform: "rotate(90deg)" }}/>
                  </span>
                }/>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 500,
          background: "var(--app-panel)", border: "1px solid var(--app-border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 5,
          maxHeight: 260, overflowY: "auto"
        }}>
          {FONT_SIZE_PRESETS.map(s => {
            const sel = s === value;
            return (
              <div key={s}
                   onClick={() => { onChange(s); setOpen(false); }}
                   style={{
                     display: "flex", alignItems: "center", gap: 6,
                     padding: "6px 12px 6px 8px", fontSize: 13, cursor: "pointer", borderRadius: 6,
                     color: "var(--app-fg)",
                   }}
                   onMouseEnter={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
                   onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--app-fg)"; }}>
                <span style={{ width: 14, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  {sel && <Icon.Check size={12}/>}
                </span>
                {s}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Font-weight dropdown — custom popup matching FontSizeInput so the two
// type fields read identically (the old native <select> rendered OS chrome,
// which looked like a "glass" panel out of step with the rest of the UI).
const FONT_WEIGHTS = [
  { v: 300, label: "Light" },
  { v: 400, label: "Regular" },
  { v: 500, label: "Medium" },
  { v: 600, label: "Semibold" },
  { v: 700, label: "Bold" },
  { v: 800, label: "Extrabold" },
];
function FontWeightSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  const cur = FONT_WEIGHTS.find(w => w.v === value) || FONT_WEIGHTS[1];
  return (
    <div ref={ref} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <div className="input-wrap" onClick={() => setOpen(o => !o)}
           style={{ cursor: "pointer", justifyContent: "space-between", paddingRight: 6 }}>
        <span style={{ fontSize: 12, color: "var(--app-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur.label}</span>
        <span className="suffix" style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <Icon.ChevronR size={9} style={{ transform: "rotate(90deg)" }}/>
        </span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 500,
          background: "var(--app-panel)", border: "1px solid var(--app-border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 5,
          maxHeight: 260, overflowY: "auto"
        }}>
          {FONT_WEIGHTS.map(w => {
            const sel = w.v === value;
            return (
              <div key={w.v}
                   onClick={() => { onChange(w.v); setOpen(false); }}
                   style={{
                     display: "flex", alignItems: "center", gap: 6,
                     padding: "6px 12px 6px 8px", fontSize: 13, cursor: "pointer", borderRadius: 6,
                     color: "var(--app-fg)",
                   }}
                   onMouseEnter={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
                   onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--app-fg)"; }}>
                <span style={{ width: 14, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  {sel && <Icon.Check size={12}/>}
                </span>
                {w.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Generic value-picker dropdown — shared by blend mode, stroke style, and
// stroke position so every select matches the type dropdowns (custom popup
// with a checkmark on the active value + blue hover) instead of the OS-native
// "glass" <select> chrome. options: [{ v, label }].
function SelectMenu({ value, onChange, options, flex = 1, triggerStyle, renderLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  const cur = options.find(o => o.v === value) || options[0];
  return (
    <div ref={ref} style={{ position: "relative", flex, minWidth: 0 }}>
      <div className="input-wrap" onClick={() => setOpen(o => !o)}
           style={{ cursor: "pointer", justifyContent: "space-between", paddingRight: 6, ...triggerStyle }}>
        <span style={{ fontSize: 12, color: "var(--app-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {renderLabel ? renderLabel(cur) : cur?.label}
        </span>
        <span className="suffix" style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <Icon.ChevronR size={9} style={{ transform: "rotate(90deg)" }}/>
        </span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 500,
          background: "var(--app-panel)", border: "1px solid var(--app-border)",
          borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 5,
          maxHeight: 260, overflowY: "auto"
        }}>
          {options.map(o => {
            const sel = o.v === value;
            return (
              <div key={o.v}
                   onClick={() => { onChange(o.v); setOpen(false); }}
                   style={{
                     display: "flex", alignItems: "center", gap: 6,
                     padding: "6px 12px 6px 8px", fontSize: 13, cursor: "pointer", borderRadius: 6,
                     color: "var(--app-fg)",
                   }}
                   onMouseEnter={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
                   onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--app-fg)"; }}>
                <span style={{ width: 14, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  {sel && <Icon.Check size={12}/>}
                </span>
                {renderLabel ? renderLabel(o) : o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Zoom dropdown shown in the inspector tab row (Figma-style). Presets +
// zoom-to-fit, plus +/- steps. Closes on outside click.
function ZoomMenu({ zoom, setZoom, fitZoom }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const click = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    setTimeout(() => window.addEventListener("mousedown", click), 0);
    return () => window.removeEventListener("mousedown", click);
  }, [open]);
  const clampZoom = (z) => Math.max(0.05, Math.min(256, z));
  const presets = [0.5, 1, 2];
  return (
    <div className="rp-zoom" ref={ref}>
      <button className="rp-zoom-btn" onClick={() => setOpen(v => !v)} title="Zoom">
        <span>{Math.round(zoom * 100)}%</span>
        <Icon.Chevron size={10} />
      </button>
      {open && (
        <div className="rp-zoom-menu">
          <button onClick={() => { setZoom(clampZoom(zoom + 0.1)); }}>Zoom in</button>
          <button onClick={() => { setZoom(clampZoom(zoom - 0.1)); }}>Zoom out</button>
          <button onClick={() => { fitZoom?.(); setOpen(false); }}>Zoom to fit</button>
          <div className="rp-zoom-sep" />
          {presets.map(p => (
            <button key={p} className={Math.abs(zoom - p) < 0.001 ? "on" : ""}
                    onClick={() => { setZoom(p); setOpen(false); }}>{p * 100}%</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Right-panel header chrome: account avatar, Present (preview), Share button,
// and the Design/Prototype tab row with the zoom control. Rendered at the top
// of every inspector state (no selection / multi / single).
function PanelTopBar({ mode, setMode, zoom, setZoom, fitZoom }) {
  return (
    <div className="rp-chrome">
      <div className="rp-header">
        <div className="rp-avatar">K</div>
        <div style={{ flex: 1 }} />
        <button className="rp-present" title="Present">
          <Icon.Eye size={18} />
        </button>
        <button className="rp-share">Share</button>
      </div>
      <div className="rp-tabs-row">
        <div className="rp-tabs">
          <button className={`rp-tab ${mode === "design" ? "active" : ""}`}
                  onClick={() => setMode("design")}>Design</button>
          <button className={`rp-tab ${mode === "prototype" ? "active" : ""}`}
                  onClick={() => setMode("prototype")}>Automation</button>
        </div>
        <ZoomMenu zoom={zoom} setZoom={setZoom} fitZoom={fitZoom} />
      </div>
    </div>
  );
}

// Selection colors — Figma-style. Collects every distinct color used across
// the selection AND all descendants (so selecting a frame surfaces the colors
// of everything inside it), spanning solid fills, gradient stops, and strokes.
// Editing a swatch recolors every matching paint across the whole scope in one
// action.
function SelectionColorsSection({ selected, children, activePageId, setDoc, history }) {
  const [picker, setPicker] = useState(null); // { hex, anchor }
  // The hex currently being edited by the open picker. A ref (not state) so a
  // continuous drag always recolors the LATEST color even if the popover's
  // drag handler captured a stale onChange closure — otherwise only the first
  // drag step matches and the live preview freezes after one change.
  const editingHexRef = useRef(null);

  // Scope = selected nodes + all of their descendants.
  const scopeNodes = useMemo(() => {
    const byParent = {};
    children.forEach(c => { (byParent[c.parentId || "__root"] ||= []).push(c); });
    const out = [], seen = new Set();
    const visit = (node) => {
      if (!node || seen.has(node.id)) return;
      seen.add(node.id);
      out.push(node);
      (byParent[node.id] || []).forEach(visit);
    };
    selected.forEach(visit);
    return out;
  }, [selected, children]);

  // Distinct colors in scope, in first-seen order, with a representative opacity.
  const colors = useMemo(() => {
    const map = new Map(); // hex -> opacity (first seen)
    const order = [];
    const add = (hex, op) => { if (!hex) return; const u = hex.toUpperCase(); if (!map.has(u)) { map.set(u, op ?? 1); order.push(u); } };
    scopeNodes.forEach(node => {
      fillsOf(node).forEach(f => {
        if (!f || f.visible === false) return;
        if (f.type === "solid") add(f.color, f.opacity);
        else if ((f.type === "linear" || f.type === "radial") && Array.isArray(f.stops)) f.stops.forEach(s => add(s.color, s.opacity));
      });
      if (node.stroke && node.stroke.color) add(node.stroke.color, node.stroke.opacity);
    });
    return order.map(hex => ({ hex, opacity: map.get(hex) }));
  }, [scopeNodes]);

  if (colors.length === 0) return null;

  // Replace `oldHex` with the picked color everywhere it appears in scope.
  const recolor = (oldHex, val) => {
    const target = (oldHex || "").toUpperCase();
    const newHex = val.color;
    const newOpacity = val.opacity;
    const ids = new Set(scopeNodes.map(s => s.id));
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        return { ...p, children: p.children.map(c => {
          if (!ids.has(c.id)) return c;
          let next = c, changed = false;
          const fills = fillsOf(c).map(f => {
            if (!f) return f;
            if (f.type === "solid" && (f.color || "").toUpperCase() === target) {
              changed = true;
              return { ...f, color: newHex, opacity: newOpacity ?? f.opacity };
            }
            if ((f.type === "linear" || f.type === "radial") && Array.isArray(f.stops)) {
              let sc = false;
              const stops = f.stops.map(s => (s.color || "").toUpperCase() === target ? (sc = true, { ...s, color: newHex }) : s);
              if (sc) { changed = true; return { ...f, stops }; }
            }
            return f;
          });
          if (changed) next = { ...next, ...fillsPatch(fills) };
          if (next.stroke && (next.stroke.color || "").toUpperCase() === target) {
            next = { ...next, stroke: { ...next.stroke, color: newHex, opacity: newOpacity ?? next.stroke.opacity } };
          }
          return next;
        })};
      })
    }));
    // Follow the color/opacity as it changes so a live drag keeps matching.
    setPicker(pk => pk ? { ...pk, hex: (newHex || "").toUpperCase(), opacity: newOpacity ?? pk.opacity } : pk);
  };

  return (
    <Section title="Selection colors" defaultOpen={true}>
      <div className="sel-colors-list">
        {colors.map((c, i) => (
          <div key={i} className="fill-row">
            <div className="swatch"
                 title="Open color picker"
                 onClick={(e) => {
                   const r = e.currentTarget.getBoundingClientRect();
                   history.snapshot();
                   editingHexRef.current = (c.hex || "").toUpperCase();
                   setPicker({ hex: c.hex, opacity: c.opacity, anchor: { x: r.left - 240, y: r.top } });
                 }}>
              <div className="swatch-fill" style={{ background: hexToRgba(c.hex, c.opacity ?? 1) }} />
            </div>
            <HexInput value={c.hex} onChange={(hex) => {
              if ((hex || "").toUpperCase() === c.hex.toUpperCase()) return;
              history.snapshot();
              recolor(c.hex, { color: hex });
              history.commit();
            }} />
            <div className="opacity-field">
              <input type="number" value={Math.round((c.opacity ?? 1) * 100)} min={0} max={100}
                     onFocus={e => e.target.select()}
                     onChange={e => {
                       const op = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100;
                       history.snapshot();
                       recolor(c.hex, { color: c.hex, opacity: op });
                       history.commit();
                     }} />
              <span className="suffix">%</span>
            </div>
          </div>
        ))}
      </div>
      {picker && (
        <ColorPopover
          value={{ type: "solid", color: picker.hex, opacity: picker.opacity ?? 1 }}
          anchor={picker.anchor}
          onChange={(val) => {
            // Match against the live target (ref), then advance it so the next
            // drag step recolors the color we just produced.
            recolor(editingHexRef.current ?? picker.hex, val);
            editingHexRef.current = (val.color || "").toUpperCase();
          }}
          onClose={() => { history.commit(); editingHexRef.current = null; setPicker(null); }}
        />
      )}
    </Section>
  );
}

function RightPanel() {
  const { doc, setDoc, activePageId, selection, history, mode, setMode, zoom, setZoom, fitZoom, canvasBg } = useApp();
  const page = doc.pages.find(p => p.id === activePageId);
  const children = page?.children || [];
  const selected = children.filter(c => selection.includes(c.id));
  const one = selected.length === 1 ? selected[0] : null;
  const [insp, setInsp] = useState("design");
  const [colorPicker, setColorPicker] = useState(null); // { target: "fill"|"stroke", anchor }
  // Anchor for the advanced text-settings popover ({x, y}) or null.
  const [textMoreOpen, setTextMoreOpen] = useState(null);
  // Anchor for the advanced stroke-settings popover ({x, y}) or null.
  const [strokeMoreOpen, setStrokeMoreOpen] = useState(null);
  // Anchor for the per-side stroke editor popover.
  const [individualSidesOpen, setIndividualSidesOpen] = useState(null);
  // Anchor for the effects (drop shadow) editor popover.
  const [effectsOpen, setEffectsOpen] = useState(null);

  // Close the color picker whenever the selection changes so it doesn't
  // linger on top of a freshly-selected node.
  const selKey = selection.join(",");
  useEffect(() => { setColorPicker(null); setTextMoreOpen(null); setStrokeMoreOpen(null); setIndividualSidesOpen(null); setEffectsOpen(null); }, [selKey]);

// Measure text with given style; returns {w, h}
function measureText(text, { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, maxWidth, textTransform }) {
  if (!window.__textMeasurer) {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px;padding:0;margin:0;border:0;";
    document.body.appendChild(el);
    window.__textMeasurer = el;
  }
  const el = window.__textMeasurer;
  el.style.fontFamily = fontFamily || "Inter";
  el.style.fontSize = (fontSize || 16) + "px";
  el.style.fontWeight = fontWeight || 400;
  el.style.lineHeight = lineHeight || 1.25;
  el.style.letterSpacing = letterSpacing || "normal";
  el.style.textTransform = textTransform || "none";
  el.style.whiteSpace = maxWidth ? "pre-wrap" : "pre";
  el.style.wordWrap = maxWidth ? "break-word" : "normal";
  el.style.width = maxWidth ? (maxWidth + "px") : "auto";
  el.innerText = text || "";
  return { w: el.scrollWidth + 1, h: el.scrollHeight };
}
window.measureText = measureText;

// Given a text node + a proposed typography patch, return the patch with
// w/h recomputed based on the node's sizing mode (auto-wh, auto-h, fixed).
function remeasureText(node, patch) {
  const merged = { ...node, ...patch };
  const mode = merged.sizingMode || "auto-h";
  if (mode === "fixed") return patch; // don't touch w/h
  const styleArgs = {
    fontFamily: merged.fontFamily,
    fontSize: merged.fontSize,
    fontWeight: merged.fontWeight,
    lineHeight: lineHeightCss(merged),
    letterSpacing: merged.letterSpacing,
    textTransform: textCaseToTransform(merged.textCase),
    maxWidth: mode === "auto-h" ? merged.w : null,
  };
  const m = measureText(merged.text || "", styleArgs);
  // Paragraph spacing isn't captured by the text measurer (it just sees a
  // flat string with whiteSpace: pre-wrap). Each hard line break in the
  // source becomes a paragraph in the renderer, and consecutive paragraphs
  // are separated by `paragraphSpacing` px. Add that to the measured height
  // so auto-h / auto-wh nodes grow to fit the spacing.
  const paraCount = ((merged.text || "").match(/\n/g) || []).length;
  const extraH = paraCount * (merged.paragraphSpacing || 0);
  let h = m.h + extraH;
  // If Truncate is on, clamp the bbox height to the rendered line count
  // (so the bounding box auto-fits the visible text). Effective lines =
  // user's `truncateLines` if set, else 1 line in auto modes.
  if (merged.truncate) {
    const lines = (merged.truncateLines && merged.truncateLines > 0) ? merged.truncateLines : 1;
    const fs = merged.fontSize || 16;
    const lhVal = merged.lineHeight;
    const lhUnit = merged.lineHeightUnit;
    const lhPx = lhUnit === "px" ? (lhVal ?? fs * 1.2)
              : lhUnit === "%"  ? fs * ((lhVal ?? 120) / 100)
                                : fs * 1.2;
    h = Math.min(h, lines * lhPx);
  }
  if (mode === "auto-wh") return { ...patch, w: m.w, h };
  return { ...patch, h };
}

// When the user types a new W or H for a TEXT node in the inspector, we need
// to mirror what the drag-resize handle does — otherwise the box won't
// change visually. Text in `auto-wh` mode IGNORES n.w (renders with
// `width: max-content`), so a bare {w: v} patch does nothing on screen.
// Returns a patch that includes the right sizingMode + remeasured companion
// dimension. For non-text nodes returns the patch unchanged.
function resizeTextSafe(node, patch, which) {
  if (node?.type !== "text") return patch;
  if (which === "w") {
    // Promote to auto-h: width is locked, height reflows to fit text.
    return remeasureText(node, { ...patch, sizingMode: "auto-h" });
  }
  if (which === "h") {
    // User wants a specific height → fixed mode (no remeasure).
    return { ...patch, sizingMode: "fixed" };
  }
  return patch;
}

const update = (patch) => {
    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => p.id === activePageId
        ? { ...p, children: p.children.map(c => selection.includes(c.id) ? { ...c, ...patch } : c) }
        : p)
    }));
    history.commit();
  };

  // Like update(), but coalesces rapid same-source edits (text typing, color
  // scrubbing, etc.) into a SINGLE undo entry. Pass a transient key that
  // identifies the edit source — e.g. "name:<nodeId>" — so different fields
  // remain separate undo entries.
  const updateTransient = (transientKey, patch) => {
    history.beginTransient(transientKey);
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => p.id === activePageId
        ? { ...p, children: p.children.map(c => selection.includes(c.id) ? { ...c, ...patch } : c) }
        : p)
    }));
  };

  // Move a node by (dx, dy) — and its descendants, since child coords are
  // ABSOLUTE world coords. If we only moved the frame, kids would visually
  // drift out (kids render at `c.x - frame.x`, so frame.x moving alone breaks
  // their relative offset). Used by Align and X/Y position inputs.
  const translateNode = (id, dx, dy) => {
    if (!dx && !dy) return;
    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        const ids = new Set([id]);
        let added = true;
        while (added) {
          added = false;
          p.children.forEach(c => {
            if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); added = true; }
          });
        }
        return {
          ...p,
          children: p.children.map(c => ids.has(c.id)
            ? { ...c, x: Math.round(c.x + dx), y: Math.round(c.y + dy) } : c)
        };
      })
    }));
    history.commit();
  };

  // Align selected nodes to their parent frame (or to the bbox of the selection if multiple
  // top-level items are selected). Works even when only one node is selected.
  const alignTo = (dir) => {
    const sel = selected;
    if (!sel.length) return;
    // If the selection are in-flow children of a single auto-layout frame,
    // the align buttons control the PARENT's auto-layout alignment (position
    // is layout-driven, so writing x/y would do nothing) — matching Figma.
    {
      const pids = new Set(sel.map(s => s.parentId || null));
      const commonPid = pids.size === 1 ? [...pids][0] : null;
      const parentNode = commonPid ? children.find(c => c.id === commonPid) : null;
      const parentAL = parentNode && parentNode.type === "frame" && parentNode.autoLayout
        && sel.every(s => s.layoutPositioning !== "absolute");
      if (parentAL) {
        const isRow = parentNode.direction !== "column";
        const horiz = { left: "start", hcenter: "center", right: "end" };
        const vert = { top: "start", vcenter: "center", bottom: "end" };
        const patch = {};
        if (dir in horiz) patch[isRow ? "primaryAlign" : "counterAlign"] = horiz[dir];
        if (dir in vert) patch[isRow ? "counterAlign" : "primaryAlign"] = vert[dir];
        if ((patch.primaryAlign) && parentNode.spacingMode === "space-between") patch.spacingMode = "packed";
        // For TEXT children, also set the paragraph alignment so the glyphs
        // themselves move — otherwise a wide (auto-height / fixed) text box
        // centers but its left-aligned glyphs still look off-center.
        const textAlignH = { left: "left", hcenter: "center", right: "right" }[dir];
        const textVAlign = { top: "top", vcenter: "middle", bottom: "bottom" }[dir];
        const selIds = new Set(sel.map(s => s.id));
        history.snapshot();
        setDoc(d => ({
          ...d,
          pages: d.pages.map(p => p.id === activePageId
            ? { ...p, children: p.children.map(c => {
                if (c.id === parentNode.id) return { ...c, ...patch };
                if (selIds.has(c.id) && c.type === "text") {
                  const tp = {};
                  if (textAlignH) tp.align = textAlignH;
                  if (textVAlign) tp.verticalAlign = textVAlign;
                  return { ...c, ...tp };
                }
                return c;
              }) }
            : p)
        }));
        history.commit();
        return;
      }
    }
    // Selection-bbox fallback for root-level nodes
    const selBbox = () => {
      const xs = sel.map(s => s.x), ys = sel.map(s => s.y);
      const x2 = sel.map(s => s.x + s.w), y2 = sel.map(s => s.y + s.h);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...x2) - Math.min(...xs), h: Math.max(...y2) - Math.min(...ys) };
    };
    const bbox = selBbox();
    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        // 1. Compute per-selected-node delta.
        const moves = {}; // nodeId -> {dx, dy}
        sel.forEach(c => {
          // Alignment target:
          //  • Multi-selection (2+ items) → align to the SELECTION bounding
          //    box, i.e. relative to each other (Figma behavior). Using the
          //    parent frame here is what made objects jump back to the frame.
          //  • Single selection → align to its parent frame (or the selection
          //    bbox, which is the node itself, when it has no parent).
          const parent = (sel.length === 1 && c.parentId) ? p.children.find(k => k.id === c.parentId) : null;
          const tx = parent ? parent.x : bbox.x;
          const ty = parent ? parent.y : bbox.y;
          const tw = parent ? parent.w : bbox.w;
          const th = parent ? parent.h : bbox.h;
          // Account for rotation: a rotated rect's visual extent on each
          // axis is bigger than its stored w/h. The visual bbox is centered
          // at the same point as the stored bbox (rotation pivots around
          // the shape's center), but its width/height grow with the
          // rotation angle. Aligning the VISUAL edges to the frame is what
          // users expect — Figma does this.
          const angle = ((c.rotation || 0) * Math.PI) / 180;
          const cosA = Math.abs(Math.cos(angle));
          const sinA = Math.abs(Math.sin(angle));
          const visW = c.w * cosA + c.h * sinA;
          const visH = c.w * sinA + c.h * cosA;
          // Snap the ALIGNED EDGE to an integer pixel, not the child's
          // top-left position. The (visW - c.w) / 2 offsets translate
          // visual-edge alignment back into stored-x/y space.
          let nx = c.x, ny = c.y;
          if (dir === "left")    nx = Math.round(tx) + (visW - c.w) / 2;
          if (dir === "hcenter") nx = Math.round(tx + tw / 2) - c.w / 2;
          if (dir === "right")   nx = Math.round(tx + tw) - (visW + c.w) / 2;
          if (dir === "top")     ny = Math.round(ty) + (visH - c.h) / 2;
          if (dir === "vcenter") ny = Math.round(ty + th / 2) - c.h / 2;
          if (dir === "bottom")  ny = Math.round(ty + th) - (visH + c.h) / 2;
          moves[c.id] = { dx: nx - c.x, dy: ny - c.y };
        });
        // 2. For each node, inherit move from the closest moving ancestor (or self).
        //    Selected nodes use their own move; their descendants ride along.
        const byId = Object.fromEntries(p.children.map(c => [c.id, c]));
        const moveFor = (id) => {
          let cur = byId[id];
          while (cur) {
            if (moves[cur.id]) return moves[cur.id];
            cur = cur.parentId ? byId[cur.parentId] : null;
          }
          return null;
        };
        return {
          ...p,
          children: p.children.map(c => {
            const m = moveFor(c.id);
            if (!m) return c;
            return { ...c, x: c.x + m.dx, y: c.y + m.dy };
          })
        };
      })
    }));
    history.commit();
  };

  // Distribute selected nodes evenly along an axis. Two modes:
  // - "spacing": equal GAPS between adjacent items (Figma's "Distribute spacing")
  // - "centers": equal spacing between item CENTERS (Figma's older default)
  const distribute = (axis /* "h" | "v" */, mode = "spacing") => {
    const sel = selected.slice();
    if (sel.length < 3) return;
    history.snapshot();
    // Sort by position on the axis.
    sel.sort((a, b) => axis === "h" ? a.x - b.x : a.y - b.y);
    const first = sel[0], last = sel[sel.length - 1];
    const updates = {};
    if (mode === "spacing") {
      const start = axis === "h" ? first.x : first.y;
      const end = axis === "h" ? (last.x + last.w) : (last.y + last.h);
      const sizesSum = sel.reduce((sum, s) => sum + (axis === "h" ? s.w : s.h), 0);
      const gap = (end - start - sizesSum) / (sel.length - 1);
      let cursor = start;
      sel.forEach(s => {
        if (axis === "h") { updates[s.id] = { dx: cursor - s.x, dy: 0 }; cursor += s.w + gap; }
        else              { updates[s.id] = { dx: 0, dy: cursor - s.y }; cursor += s.h + gap; }
      });
    } else { // centers
      const c0 = axis === "h" ? (first.x + first.w/2) : (first.y + first.h/2);
      const cN = axis === "h" ? (last.x + last.w/2)   : (last.y + last.h/2);
      const step = (cN - c0) / (sel.length - 1);
      sel.forEach((s, i) => {
        const target = c0 + step * i;
        const cur = axis === "h" ? (s.x + s.w/2) : (s.y + s.h/2);
        if (axis === "h") updates[s.id] = { dx: target - cur, dy: 0 };
        else              updates[s.id] = { dx: 0, dy: target - cur };
      });
    }
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        return { ...p, children: p.children.map(c => {
          const m = updates[c.id]; if (!m) return c;
          return { ...c, x: c.x + m.dx, y: c.y + m.dy };
        })};
      })
    }));
    history.commit();
  };

  if (!one) {
    // Page properties
    return (
      <div className="panel right-panel">
        <PanelTopBar mode={mode} setMode={setMode} zoom={zoom} setZoom={setZoom} fitZoom={fitZoom} />
        {selected.length > 1 ? (() => {
          const xs = selected.map(s => s.x);
          const ys = selected.map(s => s.y);
          const x2 = selected.map(s => s.x + s.w);
          const y2 = selected.map(s => s.y + s.h);
          const bbox = {
            x: Math.min(...xs), y: Math.min(...ys),
            w: Math.max(...x2) - Math.min(...xs),
            h: Math.max(...y2) - Math.min(...ys),
          };
          const canDistribute = selected.length >= 3;
          return (
          <>
            <Section title={`${selected.length} selected`}>
              {/* Alignment — 6 buttons in two pills. Aligns every selected
                  item to the selection's bounding box (or the parent frame
                  when items share a parent — handled by alignTo). */}
              <div className="row">
                <div className="align-pill">
                  <button title="Align left"      onClick={() => alignTo("left")}><Icon.AlignLeftSolid size={16}/></button>
                  <button title="Align H center"  onClick={() => alignTo("hcenter")}><Icon.AlignCenterSolid size={16}/></button>
                  <button title="Align right"     onClick={() => alignTo("right")}><Icon.AlignRightSolid size={16}/></button>
                </div>
                <div className="align-pill">
                  <button title="Align top"       onClick={() => alignTo("top")}><Icon.AlignTopSolid size={16}/></button>
                  <button title="Align V center"  onClick={() => alignTo("vcenter")}><Icon.AlignMidSolid size={16}/></button>
                  <button title="Align bottom"    onClick={() => alignTo("bottom")}><Icon.AlignBottomSolid size={16}/></button>
                </div>
              </div>
              {/* Distribute — equal gaps between items. Needs 3+ items. */}
              <div className="row" style={{ marginTop: 6 }}>
                <div className="align-pill">
                  <button title="Distribute horizontal spacing" disabled={!canDistribute}
                          onClick={() => distribute("h")}>
                    <Icon.DistributeH size={16}/>
                  </button>
                  <button title="Distribute vertical spacing" disabled={!canDistribute}
                          onClick={() => distribute("v")}>
                    <Icon.DistributeV size={16}/>
                  </button>
                  <button title="Tidy up — auto distribute" disabled={!canDistribute}
                          onClick={() => {
                            // Tidy = pick the axis with the larger span and
                            // distribute on it (Figma's default behavior).
                            const xspan = bbox.w, yspan = bbox.h;
                            distribute(xspan > yspan ? "h" : "v");
                          }}>
                    <Icon.Tidy size={16}/>
                  </button>
                </div>
              </div>
              {/* Selection bounding box readout */}
              <div className="row" style={{ marginTop: 6 }}>
                <NumInput prefix="X" value={Math.round(bbox.x)}
                          onChange={v => { const dx = v - bbox.x; selected.forEach(s => translateNode(s.id, dx, 0)); }}/>
                <NumInput prefix="Y" value={Math.round(bbox.y)}
                          onChange={v => { const dy = v - bbox.y; selected.forEach(s => translateNode(s.id, 0, dy)); }}/>
              </div>
              <div className="row">
                <NumInput prefix="W" value={Math.round(bbox.w)} onChange={() => {}}/>
                <NumInput prefix="H" value={Math.round(bbox.h)} onChange={() => {}}/>
              </div>
              <div style={{ fontSize: 11, color: "var(--app-fg-3)", marginTop: 8, lineHeight: 1.4 }}>
                Arrow keys nudge all · Delete removes all · Drag the selection to move together.
              </div>
            </Section>
            <SelectionColorsSection selected={selected} children={children}
              activePageId={activePageId} setDoc={setDoc} history={history} />
          </>
          );
        })()
         : (
          <>
            <Section title="Page">
              <div className="row">
                <div className="input-wrap" style={{ flex: 1 }}>
                  <input value={page?.name || ""} onChange={e => setDoc(d => ({
                    ...d,
                    pages: d.pages.map(p => p.id === activePageId ? { ...p, name: e.target.value } : p)
                  }))} />
                </div>
              </div>
            </Section>
            {(() => {
              // Page background — shown as a Fill row (Figma's "Background").
              // Defaults to the live canvas background so the row reflects
              // what's on screen until the user edits it.
              const bg = page?.bg || { type: "solid", color: (canvasBg || "#FFFFFF").toUpperCase(), opacity: 1, visible: true };
              const setBg = (patch) => setDoc(d => ({
                ...d,
                pages: d.pages.map(p => p.id === activePageId ? { ...p, bg: { ...bg, ...patch } } : p)
              }));
              const swatchBg = bg.visible === false ? "transparent" : hexToRgba(bg.color, bg.opacity ?? 1);
              return (
                <Section title="Background">
                  <div className="paint-row">
                    <div className={"fill-row" + (bg.visible === false ? " is-hidden" : "")}>
                      <div className="swatch" onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setColorPicker({ target: "pageBg", anchor: { x: r.left - 240, y: r.top } });
                      }}>
                        <div className="swatch-fill" style={{ background: swatchBg }}/>
                      </div>
                      <HexInput value={bg.color} onChange={hex => setBg({ color: hex })} />
                      <div className="opacity-field">
                        <input type="number" value={Math.round((bg.opacity ?? 1) * 100)} min={0} max={100}
                               onFocus={e => e.target.select()}
                               onChange={e => setBg({ opacity: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100 })} />
                        <span className="suffix">%</span>
                      </div>
                    </div>
                    <button className="paint-action" title={bg.visible === false ? "Show background" : "Hide background"}
                            onClick={() => setBg({ visible: bg.visible === false ? true : false })}>
                      {bg.visible === false ? <Icon.EyeOff size={16}/> : <Icon.Eye size={16}/>}
                    </button>
                  </div>
                  {colorPicker?.target === "pageBg" && (
                    <ColorPopover
                      value={bg}
                      anchor={colorPicker.anchor}
                      onChange={(val) => setBg({ color: val.color, opacity: val.opacity })}
                      onClose={() => setColorPicker(null)}
                    />
                  )}
                </Section>
              );
            })()}
            <Section title="Local variables">
              <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>None yet.</div>
            </Section>
            <Section title="Export">
              <ExportControls getTarget={() => {
                // Whole page: union bbox of all root nodes (offset* are logical
                // world coords, unaffected by the canvas zoom transform).
                const world = document.querySelector(".canvas-world");
                if (!world) return null;
                const roots = [...world.children].filter(c => c.getAttribute && c.getAttribute("data-node-id"));
                if (!roots.length) return null;
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                roots.forEach(el => {
                  const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
                  minX = Math.min(minX, x); minY = Math.min(minY, y);
                  maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
                });
                const bw = Math.max(1, Math.round(maxX - minX));
                const bh = Math.max(1, Math.round(maxY - minY));
                return {
                  el: world, w: bw, h: bh, name: "design",
                  capture: {
                    width: bw, height: bh,
                    style: { transform: `translate(${-minX}px, ${-minY}px)`, transformOrigin: "top left" },
                  },
                };
              }} />
            </Section>
          </>
        )}
      </div>
    );
  }

  // Single-node inspector
  const n = one;
  // Resolved layout geometry for this node (hug/fill-aware display size).
  const _layoutResolved = (() => {
    try { return window.LayoutEngine.resolve(children).geom; } catch (_) { return null; }
  })();
  const resolvedGeom = _layoutResolved ? _layoutResolved.get(n.id) || null : null;
  const nodeParent = n.parentId ? children.find(c => c.id === n.parentId) : null;
  const parentIsAL = !!(nodeParent && nodeParent.type === "frame" && nodeParent.autoLayout);
  const parentGeom = (_layoutResolved && nodeParent) ? _layoutResolved.get(nodeParent.id) || null : null;
  // In-flow auto-layout children have their position controlled by layout, so
  // we show the RESOLVED position relative to the parent rather than the
  // (meaningless) stored coords.
  const isFlowChild = parentIsAL && n.layoutPositioning !== "absolute";
  return (
    <div className="panel right-panel">
      <PanelTopBar mode={mode} setMode={setMode} zoom={zoom} setZoom={setZoom} fitZoom={fitZoom} />
      <Section title={n.type === "frame" ? "Frame" : n.name}>
        <div className="row">
          <div className="input-wrap" style={{ flex: 1 }}>
            <input value={n.name} onChange={e => updateTransient("name:" + n.id, { name: e.target.value })}/>
          </div>
        </div>
        {n.type === "frame" && (
          <div className="row" style={{ marginTop: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--app-fg-2)", cursor: "pointer" }}>
              <input type="checkbox" checked={n.clipContent !== false}
                     onChange={e => update({ clipContent: e.target.checked })}/>
              Clip content
            </label>
          </div>
        )}
      </Section>

      <Section title="Position">
        {/* Align grid — two pills of 3, separated by the standard row gap so
            the visual midline aligns with X/Y, W/H and every other row. */}
        <div className="row">
          <div className="align-pill">
            <button title="Align left" onClick={() => alignTo("left")}><Icon.AlignLeftSolid size={16}/></button>
            <button title="Align H center" onClick={() => alignTo("hcenter")}><Icon.AlignCenterSolid size={16}/></button>
            <button title="Align right" onClick={() => alignTo("right")}><Icon.AlignRightSolid size={16}/></button>
          </div>
          <div className="align-pill">
            <button title="Align top" onClick={() => alignTo("top")}><Icon.AlignTopSolid size={16}/></button>
            <button title="Align V center" onClick={() => alignTo("vcenter")}><Icon.AlignMidSolid size={16}/></button>
            <button title="Align bottom" onClick={() => alignTo("bottom")}><Icon.AlignBottomSolid size={16}/></button>
          </div>
        </div>
        <div className="row">
          <NumInput prefix="X" disabled={isFlowChild}
                    value={Math.round(isFlowChild && resolvedGeom && parentGeom
                      ? resolvedGeom.x - parentGeom.x
                      : n.x - (n.parentId ? children.find(c => c.id === n.parentId)?.x || 0 : 0))}
                    onChange={v => {
                      if (isFlowChild) return; // position is layout-controlled
                      const px = n.parentId ? children.find(c => c.id === n.parentId)?.x || 0 : 0;
                      translateNode(n.id, (v + px) - n.x, 0);
                    }}/>
          <NumInput prefix="Y" disabled={isFlowChild}
                    value={Math.round(isFlowChild && resolvedGeom && parentGeom
                      ? resolvedGeom.y - parentGeom.y
                      : n.y - (n.parentId ? children.find(c => c.id === n.parentId)?.y || 0 : 0))}
                    onChange={v => {
                      if (isFlowChild) return;
                      const py = n.parentId ? children.find(c => c.id === n.parentId)?.y || 0 : 0;
                      translateNode(n.id, 0, (v + py) - n.y);
                    }}/>
        </div>
        {/* Rotation + transform actions on one row */}
        <div className="row pos-rot-row">
          <NumInput prefix={<Icon.Rotate size={11}/>} value={Math.round(n.rotation || 0)} onChange={v => update({ rotation: v })} suffix="°"/>
          <div className="toggle-pill pos-transform-pill">
            <button title="Rotate 90° clockwise"
                    onClick={() => update({ rotation: ((Math.round(n.rotation || 0) + 90) % 360 + 360) % 360 })}>
              <Icon.RotateCW size={14}/>
            </button>
            <button title="Flip horizontal"
                    className={n.flipH ? "on" : ""}
                    onClick={() => update({ flipH: !n.flipH })}>
              <Icon.FlipH size={14}/>
            </button>
            <button title="Flip vertical"
                    className={n.flipV ? "on" : ""}
                    onClick={() => update({ flipV: !n.flipV })}>
              <Icon.FlipV size={14}/>
            </button>
          </div>
        </div>
      </Section>

      <Section title="Layout">
        {n.type === "text" && (
          <div className="row">
            <div className="toggle-pill layout-sizing-pill">
              <button title="Auto width — text grows horizontally"
                      className={(n.sizingMode || "auto-wh") === "auto-wh" ? "on" : ""}
                      onClick={() => {
                        const m = measureText(n.text || "", {
                          fontFamily: n.fontFamily, fontSize: n.fontSize, fontWeight: n.fontWeight,
                          lineHeight: lineHeightCss(n), letterSpacing: n.letterSpacing, maxWidth: null,
                          textTransform: textCaseToTransform(n.textCase),
                        });
                        update({ sizingMode: "auto-wh", w: m.w, h: m.h });
                      }}>
                <Icon.SizeAutoW size={14}/>
              </button>
              <button title="Auto height — fixed width, height grows"
                      className={(n.sizingMode || "auto-wh") === "auto-h" ? "on" : ""}
                      onClick={() => {
                        const m = measureText(n.text || "", {
                          fontFamily: n.fontFamily, fontSize: n.fontSize, fontWeight: n.fontWeight,
                          lineHeight: lineHeightCss(n), letterSpacing: n.letterSpacing, maxWidth: n.w,
                          textTransform: textCaseToTransform(n.textCase),
                        });
                        update({ sizingMode: "auto-h", w: n.w, h: m.h });
                      }}>
                <Icon.SizeAutoH size={14}/>
              </button>
              <button title="Fixed size — both dimensions locked"
                      className={n.sizingMode === "fixed" ? "on" : ""}
                      onClick={() => update({ sizingMode: "fixed" })}>
                <Icon.SizeFixed size={14}/>
              </button>
            </div>
          </div>
        )}
        <LayoutSizeRow n={n} update={update} children={children} resolved={resolvedGeom} resizeTextSafe={resizeTextSafe}/>
        <div className="row">
          <NumInput prefix={<Icon.Corners size={11}/>} value={n.radius || 0} min={0} onChange={v => update({ radius: v })}/>
          <div className="input-wrap" style={{ visibility: "hidden", pointerEvents: "none" }} aria-hidden="true"/>
        </div>
        {parentIsAL && (
          <div className="row" style={{ marginTop: 2 }}>
            <button className={"al-abs-toggle" + (n.layoutPositioning === "absolute" ? " on" : "")}
                    title="Absolute position — ignore auto layout and place this layer freely inside its parent"
                    onClick={() => update({ layoutPositioning: n.layoutPositioning === "absolute" ? undefined : "absolute" })}>
              <Icon.Pin size={13}/> Absolute position
            </button>
          </div>
        )}
      </Section>

      {n.type === "text" && (() => {
        const [moreOpen, setMoreOpen] = [textMoreOpen, setTextMoreOpen];
        return (
        <Section title="Typography">
          <div className="row">
            <FontPicker value={n.fontFamily || "Inter"} onChange={v => update(remeasureText(n, { fontFamily: v }))}/>
          </div>
          <div className="row">
            <FontWeightSelect value={n.fontWeight || 400} onChange={v => update(remeasureText(n, { fontWeight: v }))}/>
            <FontSizeInput value={n.fontSize || 16} onChange={v => update(remeasureText(n, { fontSize: v }))}/>
          </div>
          <div className="row">
            <LineHeightInput node={n} onChange={(patch) => update(remeasureText(n, patch))} />
            <LetterSpacingInput node={n} onChange={(patch) => update(remeasureText(n, patch))} />
          </div>
          <div className="row">
            {/* Horizontal text align (left / center / right) */}
            <div className="toggle-pill">
              {["left", "center", "right"].map(a => (
                <button key={a} className={n.align === a ? "on" : ""} title={"Align " + a}
                        onClick={() => update({ align: a })}>
                  {a === "left" ? <Icon.AlignLeft size={14}/> : a === "center" ? <Icon.AlignCenter size={14}/> : <Icon.AlignRight size={14}/>}
                </button>
              ))}
            </div>
            {/* Vertical text align (top / middle / bottom) — only renders visibly
                different output in Fixed sizing mode (the auto modes hug content). */}
            <div className="toggle-pill">
              {[
                { v: "top",    icon: <Icon.VAlignTop size={14}/>, title: "Align top" },
                { v: "middle", icon: <Icon.VAlignMid size={14}/>, title: "Align middle" },
                { v: "bottom", icon: <Icon.VAlignBot size={14}/>, title: "Align bottom" },
              ].map(({ v, icon, title }) => (
                <button key={v}
                        className={(n.verticalAlign || "top") === v ? "on" : ""}
                        title={title}
                        onClick={() => update({ verticalAlign: v })}>
                  {icon}
                </button>
              ))}
            </div>
            {/* Type setting — opens the advanced typography settings popover */}
            <button className="icon-btn" title="Type setting"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMoreOpen({ x: r.left, y: r.top + 28 });
                    }}>
              <Icon.TypeSetting size={14}/>
            </button>
          </div>
          {moreOpen && (
            <TextSettingsPopover
              node={n}
              anchor={moreOpen}
              onChange={(patch) => update(remeasureText(n, patch))}
              onClose={() => setMoreOpen(null)}
            />
          )}
        </Section>
        );
      })()}

      {n.type === "frame" && (
        <Section title="Auto layout" add onAdd={() => {
          // Toggling auto-layout OFF must commit the laid-out positions back
          // into each child's world coords — otherwise the children "snap
          // back" to whatever stale x/y was stored, which is disorienting.
          // Toggling ON just flips the flag.
          if (!n.autoLayout) {
            update({ autoLayout: true, direction: n.direction || "column" });
            return;
          }
          // Bake the engine-resolved geometry (position AND hug/fill size)
          // back into each descendant's world coords, then turn AL off. Using
          // the engine keeps nested frames, fill children and hug sizing
          // exactly where they were drawn.
          const geomMap = (() => {
            try { return window.LayoutEngine.resolve(children).geom; } catch (_) { return new Map(); }
          })();
          const collectDesc = (id, acc) => {
            children.forEach(c => { if (c.parentId === id) { acc.push(c.id); collectDesc(c.id, acc); } });
            return acc;
          };
          const descIds = new Set(collectDesc(n.id, []));
          history.snapshot();
          setDoc(d => ({
            ...d,
            pages: d.pages.map(p => p.id === activePageId
              ? { ...p, children: p.children.map(c => {
                  if (c.id === n.id) return { ...c, autoLayout: false };
                  if (descIds.has(c.id)) {
                    const g = geomMap.get(c.id);
                    return g ? { ...c, x: g.x, y: g.y, w: g.w, h: g.h } : c;
                  }
                  return c;
                }) }
              : p)
          }));
          history.commit();
        }}>
          {n.autoLayout && <AutoLayoutPanel n={n} update={update}/>}
          {!n.autoLayout && <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>Click + to enable</div>}
        </Section>
      )}

      <Section title="Appearance">
        <div className="row">
          <NumInput prefix="Op" value={Math.round((n.opacity ?? 1)*100)} min={0} max={100} suffix="%"
                    onChange={v => update({ opacity: v/100 })}/>
          <SelectMenu value={n.blendMode || "normal"} onChange={v => update({ blendMode: v })}
            triggerStyle={{ background: "var(--app-panel-2)" }}
            options={[
              { v: "normal", label: "Pass through" },
              { v: "multiply", label: "Multiply" },
              { v: "screen", label: "Screen" },
              { v: "overlay", label: "Overlay" },
              { v: "darken", label: "Darken" },
              { v: "lighten", label: "Lighten" },
            ]}/>
        </div>
      </Section>

      {n.fill !== undefined && n.type !== "line" && (() => {
        const fills = fillsOf(n);
        const setFills = (next) => update(fillsPatch(next));
        const setFillAt = (i, patch) => setFills(fills.map((f, j) => j === i ? { ...f, ...patch } : f));
        const removeAt = (i) => setFills(fills.filter((_, j) => j !== i));
        const moveUp = (i) => {
          if (i <= 0) return;
          const next = fills.slice();
          [next[i-1], next[i]] = [next[i], next[i-1]];
          setFills(next);
        };
        const moveDown = (i) => {
          if (i >= fills.length - 1) return;
          const next = fills.slice();
          [next[i], next[i+1]] = [next[i+1], next[i]];
          setFills(next);
        };
        const addFill = () => setFills([{ type: "solid", color: "#D9D9D9", opacity: 1, visible: true }, ...fills]);
        return (
        <Section title="Fill" add onAdd={addFill}>
          {fills.length === 0 && (
            <div className="paint-row-empty" onClick={addFill}>+ Add fill</div>
          )}
          {fills.map((f, i) => {
            const swatchBg = f.type === "solid"
              ? hexToRgba(f.color, f.opacity ?? 1)
              : (paintBg(f) || "transparent");
            const label = f.type === "solid"
              ? (f.color || "#000000").replace("#", "").toUpperCase().slice(0, 6)
              : f.type === "linear" ? "Linear" : "Radial";
            return (
              <div className="paint-row" key={i}
                   onMouseEnter={(e) => e.currentTarget.classList.add("hovered")}
                   onMouseLeave={(e) => e.currentTarget.classList.remove("hovered")}>
                <div className={"fill-row" + (f.visible === false ? " is-hidden" : "")}>
                  <div className="swatch" onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setColorPicker({ target: "fill", index: i, anchor: { x: r.left - 240, y: r.top } });
                  }}>
                    <div className="swatch-fill" style={{ background: swatchBg }}/>
                  </div>
                  {f.type === "solid" ? (
                    <HexInput value={f.color}
                           onChange={hex => setFillAt(i, { color: hex })} />
                  ) : (
                    <div className="paint-type-label" onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setColorPicker({ target: "fill", index: i, anchor: { x: r.left - 240, y: r.top } });
                    }}>{label}</div>
                  )}
                  <div className="opacity-field">
                    <input type="number" value={Math.round((f.opacity ?? 1)*100)} min={0} max={100}
                           onFocus={e => e.target.select()}
                           onChange={e => setFillAt(i, { opacity: Math.max(0, Math.min(100, parseFloat(e.target.value)||0))/100 })} />
                    <span className="suffix">%</span>
                  </div>
                </div>
                <button className="paint-action" title={f.visible === false ? "Show fill" : "Hide fill"}
                        onClick={() => setFillAt(i, { visible: f.visible === false ? true : false })}>
                  {f.visible === false ? <Icon.EyeOff size={16}/> : <Icon.Eye size={16}/>}
                </button>
                <button className="paint-action" title="Remove fill"
                        onClick={() => removeAt(i)}>
                  <Icon.Minus size={16}/>
                </button>
              </div>
            );
          })}
        </Section>
        );
      })()}

      <Section title="Stroke" add onAdd={() => update({ stroke: n.stroke ? null : { color: "#171717", weight: 1, opacity: 1 } })}>
        {n.stroke ? (
          <>
            <div className="paint-row">
              <div className={"fill-row" + (n.stroke.visible === false ? " is-hidden" : "")}>
                <div className="swatch" onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setColorPicker({ target: "stroke", anchor: { x: r.left - 240, y: r.top } });
                }}>
                  <div className="swatch-fill" style={{ background: hexToRgba(n.stroke.color, n.stroke.opacity ?? 1) }}/>
                </div>
                <HexInput value={n.stroke.color}
                       onChange={hex => update({ stroke: { ...n.stroke, color: hex } })} />
                <div className="opacity-field">
                  <input type="number" value={Math.round((n.stroke.opacity ?? 1)*100)} min={0} max={100}
                         onFocus={e => e.target.select()}
                         onChange={e => update({ stroke: { ...n.stroke, opacity: Math.max(0,Math.min(100,parseFloat(e.target.value)||0))/100 } })} />
                  <span className="suffix">%</span>
                </div>
              </div>
              <button className="paint-action" title={n.stroke.visible === false ? "Show stroke" : "Hide stroke"}
                      onClick={() => update({ stroke: { ...n.stroke, visible: n.stroke.visible === false ? true : false } })}>
                {n.stroke.visible === false ? <Icon.EyeOff size={16}/> : <Icon.Eye size={16}/>}
              </button>
              <button className="paint-action" title="Remove stroke"
                      onClick={() => update({ stroke: null })}>
                <Icon.Minus size={16}/>
              </button>
            </div>
            <div className="paint-row">
              <SelectMenu value={n.stroke.position || "inside"} onChange={v => update({ stroke: { ...n.stroke, position: v } })}
                options={[
                  { v: "inside", label: "Inside" },
                  { v: "center", label: "Center" },
                  { v: "outside", label: "Outside" },
                ]}/>
              <NumInput prefix={<Icon.StrokeWeight size={14}/>} value={n.stroke.weight} min={0}
                        onChange={v => update({ stroke: { ...n.stroke, weight: v } })}/>
              <button className="paint-action" title="Stroke settings"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setStrokeMoreOpen({ x: r.left, y: r.bottom + 6 });
                      }}>
                <Icon.StrokeSetting size={16}/>
              </button>
              <button className="paint-action" title="Individual sides"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setIndividualSidesOpen({ x: r.left, y: r.bottom + 6 });
                      }}>
                <Icon.IndividualSides size={16}/>
              </button>
            </div>
            {strokeMoreOpen && (
              <StrokeSettingsPopover
                stroke={n.stroke}
                anchor={strokeMoreOpen}
                onChange={(patch) => update({ stroke: { ...n.stroke, ...patch } })}
                onClose={() => setStrokeMoreOpen(null)}
              />
            )}
            {individualSidesOpen && (
              <IndividualSidesPopover
                stroke={n.stroke}
                anchor={individualSidesOpen}
                onChange={(patch) => update({ stroke: { ...n.stroke, ...patch } })}
                onClose={() => setIndividualSidesOpen(null)}
              />
            )}
          </>
        ) : null}
      </Section>

      {(n.type !== "line") && (
        <Section title="Effects" add onAdd={() => update({ shadow: n.shadow ? null : { ...window.EFFECT_DEFAULTS["drop-shadow"] } })}>
          {n.shadow ? (
            <div className="paint-row">
              <div className={"fill-row" + (n.shadow.visible === false ? " is-hidden" : "")}
                   onClick={(e) => {
                     // Don't open editor if user clicked an inner control.
                     if (e.target.closest("button, input, .swatch")) return;
                     const r = e.currentTarget.getBoundingClientRect();
                     setEffectsOpen({ x: r.left, y: r.top });
                   }}
                   style={{ cursor: "pointer" }}>
                {(() => {
                  const ICONS = {
                    "drop-shadow":     Icon.FxDropShadow,
                    "inner-shadow":    Icon.FxInnerShadow,
                    "layer-blur":      Icon.FxLayerBlur,
                    "background-blur": Icon.FxBackgroundBlur,
                    "noise":           Icon.FxNoise,
                    "glass":           Icon.FxGlass,
                  };
                  const TypeIcon = ICONS[n.shadow.type || "drop-shadow"] || Icon.Droplet;
                  return <TypeIcon size={14}/>;
                })()}
                <span style={{ flex: 1, fontSize: 11, color: "var(--app-fg)" }}>
                  {({"drop-shadow":"Drop shadow","inner-shadow":"Inner shadow","layer-blur":"Layer blur","background-blur":"Background blur","noise":"Noise","glass":"Glass"})[n.shadow.type || "drop-shadow"]}
                </span>
              </div>
              <button className="paint-action"
                      title={n.shadow.visible === false ? "Show effect" : "Hide effect"}
                      onClick={() => update({ shadow: { ...n.shadow, visible: n.shadow.visible === false ? true : false } })}>
                {n.shadow.visible === false ? <Icon.EyeOff size={16}/> : <Icon.Eye size={16}/>}
              </button>
              <button className="paint-action" title="Remove effect"
                      onClick={() => update({ shadow: null })}>
                <Icon.Minus size={16}/>
              </button>
            </div>
          ) : null}
          {effectsOpen && n.shadow && (
            <EffectsPopover
              shadow={n.shadow}
              anchor={effectsOpen}
              onChange={(patch, replace) => update({ shadow: replace ? patch : { ...n.shadow, ...patch } })}
              onClose={() => setEffectsOpen(null)}
              onOpenColor={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setColorPicker({ target: "shadow", anchor: { x: r.left - 240, y: r.top } });
              }}
            />
          )}
        </Section>
      )}

      <SelectionColorsSection selected={selected} children={children}
        activePageId={activePageId} setDoc={setDoc} history={history} />

      <Section title="Layout guides" defaultOpen={false}>
        <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>Add columns or rows to the frame</div>
      </Section>

      <Section title="Export" defaultOpen={false}>
        <ExportControls getTarget={() => {
          const el = document.querySelector(`[data-node-id="${n.id}"]`);
          return el ? { el, w: Math.round(n.w), h: Math.round(n.h), name: n.name || "design" } : null;
        }} />
      </Section>

      {colorPicker && (() => {
        const pickerValue = colorPicker.target === "fill"
          ? (fillsOf(n)[colorPicker.index] || { type: "solid", color: "#D9D9D9", opacity: 1 })
          : colorPicker.target === "stroke" ? n.stroke
          : n.shadow?.type === "glass"
            ? { color: n.shadow.tintColor || "#FFFFFF", opacity: n.shadow.tintOpacity ?? 0.18 }
            : n.shadow;
        return (
        <ColorPopover
          value={pickerValue}
          allowGradient={colorPicker.target === "fill"}
          anchor={colorPicker.anchor}
          onChange={(val) => {
            if (colorPicker.target === "fill") {
              const arr = fillsOf(n).slice();
              arr[colorPicker.index] = val;
              update(fillsPatch(arr));
            }
            else if (colorPicker.target === "stroke") update({ stroke: val });
            else {
              // For shadows: drop/inner-shadow edit color+opacity; glass
              // edits the tint color+opacity instead. Other effect types
              // (blurs / noise) don't open the color picker.
              if (n.shadow?.type === "glass") {
                update({ shadow: { ...n.shadow, tintColor: val.color, tintOpacity: val.opacity } });
              } else {
                update({ shadow: { ...n.shadow, color: val.color, opacity: val.opacity } });
              }
            }
          }}
          onClose={() => setColorPicker(null)}
        />
        );
      })()}
    </div>
  );
}

export { RightPanel };
