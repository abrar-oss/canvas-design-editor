import React from "react";
import { Icon } from "./icons.jsx";
import {
  useApp, SHAPE_DEFAULTS, uid, clamp, round,
  fillCss, fillsCss, firstVisibleFill, lineHeightCss, penPathD,
  hexToRgba, paintBg,
} from "./utils.jsx";
/* global React, Icon, useApp, SHAPE_DEFAULTS, uid, clamp, round, fillCss, fillsCss, firstVisibleFill, lineHeightCss, penPathD */
const { useState, useRef, useEffect, useCallback, useMemo } = React;

// ------------------------------------------------------------
// Figma-style text editor
// Uses a contentEditable div so selection + cursor feel native.
// Reports {text, w, h} back on every input (so the node grows live),
// and commits + exits on blur/Escape.
// ------------------------------------------------------------
function FigmaTextEditor({ node, sizingMode, textStyle, onCommit }) {
  const ref = useRef(null);
  const initialText = useRef(node.text || "");

  // Mount: seed innerText ONCE, then never touch the DOM from React again.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = initialText.current;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const measureAndReport = () => {
    const el = ref.current;
    if (!el) return;
    if (sizingMode === "auto-wh") {
      onCommit(el.innerText, null, el.scrollWidth + 1, el.scrollHeight);
    } else if (sizingMode === "auto-h") {
      onCommit(el.innerText, null, null, el.scrollHeight);
    } else {
      onCommit(el.innerText, null, null, null);
    }
  };

  const onInput = () => {
    const el = ref.current;
    if (!el) return;
    const text = el.innerText;
    if (sizingMode === "auto-wh") {
      window.__textLiveUpdate?.(node.id, { text, w: el.scrollWidth + 1, h: el.scrollHeight });
    } else if (sizingMode === "auto-h") {
      window.__textLiveUpdate?.(node.id, { text, h: el.scrollHeight });
    } else {
      window.__textLiveUpdate?.(node.id, { text });
    }
  };

  const onBlur = () => {
    const el = ref.current;
    if (!el) return;
    const text = el.innerText;
    if (!text.trim()) {
      onCommit("", "__delete__", null, null);
    } else {
      measureAndReport();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); ref.current?.blur(); }
    e.stopPropagation();
  };

  // Strip formatting on paste: insert plain text only.
  // Without this, a paste from a webpage drops HTML with inline font-family,
  // font-size, and white-space styles into the contentEditable — which breaks
  // wrapping (`white-space: nowrap` overrides our `pre-wrap`) and makes
  // `scrollWidth`/`scrollHeight` measure the wrong font's metrics, so the
  // saved bbox doesn't match what the read-only renderer later draws.
  const onPaste = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (!text) return;
    // Use insertText so it merges with the current selection / undo stack.
    if (document.queryCommandSupported?.("insertText")) {
      document.execCommand("insertText", false, text);
    } else {
      // Fallback for browsers without execCommand.
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
    // execCommand fires `input` automatically; nothing else needed.
  };

  const style = sizingMode === "auto-wh"
    ? { ...textStyle,
        position: "absolute", left: 0, top: 0,
        minWidth: 4, minHeight: textStyle.fontSize,
        whiteSpace: "pre", wordWrap: "normal", overflowWrap: "normal",
        outline: "none", background: "transparent", border: "none",
        padding: 0, margin: 0, pointerEvents: "auto", zIndex: 100,
        caretColor: "var(--accent)",
        cursor: "text",
        direction: "ltr", unicodeBidi: "plaintext",
      }
    : sizingMode === "auto-h"
    ? { ...textStyle,
        position: "absolute", left: 0, top: 0,
        width: node.w, minHeight: node.h,
        whiteSpace: "pre-wrap", wordWrap: "break-word",
        outline: "none", background: "transparent", border: "none",
        padding: 0, margin: 0, pointerEvents: "auto", zIndex: 100,
        caretColor: "var(--accent)",
        cursor: "text",
        direction: "ltr", unicodeBidi: "plaintext",
      }
    : { ...textStyle,
        position: "absolute", left: 0, top: 0,
        width: node.w, height: node.h,
        whiteSpace: "pre-wrap", wordWrap: "break-word",
        outline: "none", background: "transparent", border: "none",
        padding: 0, margin: 0, pointerEvents: "auto", zIndex: 100,
        caretColor: "var(--accent)",
        overflow: "hidden",
        cursor: "text",
        direction: "ltr", unicodeBidi: "plaintext",
      };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={onInput}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onMouseDown={(e) => e.stopPropagation()}
      style={style}
    />
  );
}

// ------------------------------------------------------------
// Shape renderer
// ------------------------------------------------------------
function renderShape(n, isEditingText, onCommitText) {
  const opacity = n.opacity ?? 1;
  const fill = fillsCss(n);
  const stroke = n.stroke;
  const strokeStyle = stroke
    ? { stroke: fillCss({ type: "solid", color: stroke.color, opacity: stroke.opacity ?? 1 }),
        strokeWidth: stroke.weight ?? 1,
        strokeDasharray: stroke.style === "dashed" ? `${(stroke.weight ?? 1) * 4} ${(stroke.weight ?? 1) * 2}`
                       : stroke.style === "dotted" ? `${(stroke.weight ?? 1)} ${(stroke.weight ?? 1) * 2}`
                       : undefined,
        strokeLinejoin: stroke.join || undefined }
    : { stroke: "none", strokeWidth: 0 };
  // Per-side stroke widths (Individual sides). If any of t/r/b/l differs
  // from the uniform weight, we force CSS border rendering (inside only).
  const sideWidths = stroke?.widths || null;
  const hasIndividualSides = !!sideWidths && (
    sideWidths.t !== sideWidths.r || sideWidths.r !== sideWidths.b ||
    sideWidths.b !== sideWidths.l ||
    sideWidths.t !== (stroke.weight ?? 1) || sideWidths.r !== (stroke.weight ?? 1) ||
    sideWidths.b !== (stroke.weight ?? 1) || sideWidths.l !== (stroke.weight ?? 1)
  );
  // The stroke style affects how we draw on a div:
  //   - solid (uniform): box-shadow (supports inside/center/outside positions)
  //   - dashed/dotted OR per-side widths: CSS border (always inside, but
  //     supports dash patterns + per-side widths)
  const useBorderForStroke = stroke && stroke.visible !== false &&
                             (stroke.style === "dashed" || stroke.style === "dotted" || hasIndividualSides);
  const borderStyle = stroke && stroke.visible !== false ? (stroke.style || "solid") : undefined;
  const borderColor = stroke ? hexToRgba(stroke.color, stroke.opacity ?? 1) : undefined;
  const perSideBorderStyles = (useBorderForStroke && hasIndividualSides) ? {
    borderStyle,
    borderColor,
    borderTopWidth:    (sideWidths.t ?? stroke.weight ?? 1),
    borderRightWidth:  (sideWidths.r ?? stroke.weight ?? 1),
    borderBottomWidth: (sideWidths.b ?? stroke.weight ?? 1),
    borderLeftWidth:   (sideWidths.l ?? stroke.weight ?? 1),
  } : null;
  const borderStrokeCss = (useBorderForStroke && !hasIndividualSides)
    ? `${stroke.weight ?? 1}px ${stroke.style} ${borderColor}`
    : undefined;
  // Build the box-shadow string for div-based shapes (frame, rect, ellipse).
  // Combines stroke (inside/center/outside) and drop-shadow into one box-shadow
  // value so `border` doesn't have to be involved — borders can't do
  // outside/center placement.
  const strokeShadows = (() => {
    if (!stroke || stroke.visible === false) return [];
    if (useBorderForStroke) return []; // handled via border
    const c = hexToRgba(stroke.color, stroke.opacity ?? 1);
    const w = stroke.weight ?? 1;
    const pos = stroke.position || "inside";
    if (pos === "inside")  return [`inset 0 0 0 ${w}px ${c}`];
    if (pos === "outside") return [`0 0 0 ${w}px ${c}`];
    // center: half inside, half outside
    return [`inset 0 0 0 ${w/2}px ${c}`, `0 0 0 ${w/2}px ${c}`];
  })();
  // Resolve the single n.shadow effect (a node has at most one for now). Each
  // type maps to different CSS: drop/inner-shadow → box-shadow, layer-blur
  // → filter, background-blur / glass → backdrop-filter, noise / glass tint
  // → overlay child div.
  const fx = n.shadow && n.shadow.visible !== false ? n.shadow : null;
  const fxType = fx?.type || (fx ? "drop-shadow" : null);
  const dropShadow = (fx && fxType === "drop-shadow")
    ? `${fx.x ?? 0}px ${fx.y ?? 4}px ${fx.blur ?? 12}px ${fx.spread ?? 0}px ${hexToRgba(fx.color || "#000", fx.opacity ?? 0.15)}`
    : null;
  const innerShadow = (fx && fxType === "inner-shadow")
    ? `inset ${fx.x ?? 0}px ${fx.y ?? 4}px ${fx.blur ?? 12}px ${fx.spread ?? 0}px ${hexToRgba(fx.color || "#000", fx.opacity ?? 0.15)}`
    : null;
  const layerBlurPx     = (fx && fxType === "layer-blur")      ? (fx.blur ?? 8)  : 0;
  const backgroundBlurPx= (fx && fxType === "background-blur") ? (fx.blur ?? 16) : 0;
  const glassBlurPx     = (fx && fxType === "glass")           ? (fx.blur ?? 18) : 0;
  const combinedShadow = [...strokeShadows, dropShadow, innerShadow].filter(Boolean).join(", ") || null;
  // Layer-blur stacks on top of any legacy `n.blur` (used by older docs).
  const filterCss = [
    n.blur ? `blur(${n.blur}px)` : null,
    layerBlurPx ? `blur(${layerBlurPx}px)` : null,
  ].filter(Boolean).join(" ") || undefined;
  const backdropFilterCss = (backgroundBlurPx || glassBlurPx)
    ? `blur(${backgroundBlurPx || glassBlurPx}px)`
    : undefined;

  // For noise + glass we paint an overlay div on top of the fill so we don't
  // mutate the fill itself. Returns a style object to spread onto an inset:0
  // child, or null if no overlay is needed.
  const fxOverlayStyle = (() => {
    if (!fx) return null;
    if (fxType === "noise") {
      const scale = Math.max(0.25, fx.scale ?? 1);
      const baseFreq = (0.9 / scale).toFixed(3);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${baseFreq}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
      const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
      return { backgroundImage: url, opacity: Math.max(0, Math.min(1, fx.opacity ?? 0.18)), mixBlendMode: "overlay" };
    }
    if (fxType === "glass") {
      return { background: hexToRgba(fx.tintColor || "#FFFFFF", fx.tintOpacity ?? 0.18) };
    }
    return null;
  })();

  const common = {
    position: "absolute",
    left: 0, top: 0,
    width: n.w, height: n.h,
    opacity,
    mixBlendMode: n.blendMode || "normal",
    pointerEvents: "none",
  };

  if (n.type === "frame") {
    return (
      <div style={{ ...common, background: fill, borderRadius: n.radius || 0, overflow: "hidden",
                    border: borderStrokeCss,
                    ...perSideBorderStyles,
                    boxShadow: combinedShadow,
                    filter: filterCss,
                    backdropFilter: backdropFilterCss,
                    WebkitBackdropFilter: backdropFilterCss }}>
        {fxOverlayStyle && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "inherit", ...fxOverlayStyle }}/>
        )}
      </div>
    );
  }
  if (n.type === "rect") {
    return (
      <div style={{ ...common, background: fill, borderRadius: n.radius || 0,
             border: borderStrokeCss,
             ...perSideBorderStyles,
             boxShadow: combinedShadow,
             filter: filterCss,
             backdropFilter: backdropFilterCss,
             WebkitBackdropFilter: backdropFilterCss,
             overflow: fxOverlayStyle ? "hidden" : undefined }}>
        {fxOverlayStyle && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "inherit", ...fxOverlayStyle }}/>
        )}
      </div>
    );
  }
  if (n.type === "ellipse") {
    return (
      <div style={{ ...common, background: fill, borderRadius: "50%",
             border: borderStrokeCss,
             ...perSideBorderStyles,
             boxShadow: combinedShadow,
             filter: filterCss,
             backdropFilter: backdropFilterCss,
             WebkitBackdropFilter: backdropFilterCss,
             overflow: fxOverlayStyle ? "hidden" : undefined }}>
        {fxOverlayStyle && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "inherit", ...fxOverlayStyle }}/>
        )}
      </div>
    );
  }
  if (n.type === "line") {
    return (
      <svg style={{ ...common, width: Math.max(Math.abs(n.w), 1), height: Math.max(Math.abs(n.h), 1), overflow: "visible" }} width={Math.max(Math.abs(n.w), 1)} height={Math.max(Math.abs(n.h), 1)}>
        <line x1={0} y1={0} x2={n.w} y2={n.h} {...strokeStyle} strokeLinecap="round" />
      </svg>
    );
  }
  if (n.type === "polygon" || n.type === "star") {
    // Build percentage-based polygon points so the clip-path scales with
    // the box and CSS backgrounds (multi-fill, gradients) just work.
    const pct = [];     // for clip-path
    const px  = [];     // for stroke SVG (absolute pixels)
    if (n.type === "polygon") {
      const sides = n.sides || 6;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const cx = 50 + 50 * Math.cos(a), cy = 50 + 50 * Math.sin(a);
        pct.push(`${cx.toFixed(3)}% ${cy.toFixed(3)}%`);
        px.push(`${(n.w * cx / 100).toFixed(3)},${(n.h * cy / 100).toFixed(3)}`);
      }
    } else {
      const points = n.points || 5;
      const ir = n.innerRatio ?? 0.4;
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 1 : ir;
        const cx = 50 + 50 * r * Math.cos(a), cy = 50 + 50 * r * Math.sin(a);
        pct.push(`${cx.toFixed(3)}% ${cy.toFixed(3)}%`);
        px.push(`${(n.w * cx / 100).toFixed(3)},${(n.h * cy / 100).toFixed(3)}`);
      }
    }
    const hasStroke = stroke && stroke.visible !== false;
    // Polygon/star can't use box-shadow for drop-shadow (the rectangular
    // shadow box would peek outside the polygon outline). Use filter:
    // drop-shadow() instead, which follows the clip-path.
    const dropShadowFilter = dropShadow
      ? `drop-shadow(${(fx.x ?? 0)}px ${(fx.y ?? 4)}px ${(fx.blur ?? 12)}px ${hexToRgba(fx.color || "#000", fx.opacity ?? 0.15)})`
      : null;
    const polyFilter = [filterCss, dropShadowFilter].filter(Boolean).join(" ") || undefined;
    return (
      <div style={{ ...common, overflow: "visible", filter: polyFilter }}>
        {/* Fill layer — clipped to the polygon shape so CSS backgrounds
            (solid + gradient stacks) render correctly. The same clip
            extends to inner-shadow and overlay effects. */}
        <div style={{ position: "absolute", inset: 0,
                      background: fill,
                      clipPath: `polygon(${pct.join(", ")})`,
                      boxShadow: innerShadow || undefined,
                      backdropFilter: backdropFilterCss,
                      WebkitBackdropFilter: backdropFilterCss }} />
        {fxOverlayStyle && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
                        clipPath: `polygon(${pct.join(", ")})`,
                        ...fxOverlayStyle }} />
        )}
        {/* Stroke layer — kept as SVG so dashed/dotted/round-join still work. */}
        {hasStroke && (
          <svg style={{ position: "absolute", inset: 0, overflow: "visible" }}
               width={n.w} height={n.h}>
            <polygon points={px.join(" ")} fill="none" {...strokeStyle} />
          </svg>
        )}
      </div>
    );
  }
  if (n.type === "text") {
    const fontFamily = n.fontFamily || "Inter";
    if (window.ensureFont) window.ensureFont(fontFamily);
    const sizingMode = n.sizingMode || "auto-h"; // "auto-wh" | "auto-h" | "fixed"
    // Map our friendly fields to CSS values.
    const textDecoration = n.textDecoration === "underline" ? "underline"
                         : n.textDecoration === "strike"    ? "line-through"
                         : "none";
    const textTransform  = n.textCase === "upper" ? "uppercase"
                         : n.textCase === "lower" ? "lowercase"
                         : n.textCase === "title" ? "capitalize"
                         : "none";
    // Letter-spacing percent → em (CSS doesn't support % directly).
    const ls = (() => {
      const raw = n.letterSpacing;
      if (raw == null || raw === "") return "normal";
      const m = String(raw).match(/^(-?\d+(?:\.\d+)?)(px|em)?$/);
      if (!m) return raw;
      const num = parseFloat(m[1]);
      const unit = m[2] || (n.letterSpacingUnit === "px" ? "px" : "em");
      return num + unit;
    })();
    // Text supports a single visible paint for its glyphs. If it's solid,
    // we paint via `color`; if it's a gradient, we use background-clip: text.
    const firstFill = firstVisibleFill(n);
    const textPaintStyle = (() => {
      if (!firstFill) return { color: "transparent" };
      if (firstFill.type === "solid") {
        return { color: hexToRgba(firstFill.color, firstFill.opacity ?? 1) };
      }
      const bg = paintBg(firstFill);
      return bg
        ? { backgroundImage: bg, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
        : { color: "transparent" };
    })();
    const textStyle = {
      ...textPaintStyle,
      fontSize: n.fontSize, fontWeight: n.fontWeight, textAlign: n.align,
      lineHeight: lineHeightCss(n), fontFamily,
      letterSpacing: ls,
      textDecoration,
      textTransform,
      direction: "ltr",
    };

    if (isEditingText) {
      // Figma-style editor: a live-resizing textarea that reports {text, w, h} on every change
      return (
        <FigmaTextEditor
          node={n}
          sizingMode={sizingMode}
          textStyle={textStyle}
          onCommit={onCommitText}
        />
      );
    }

    // Vertical alignment + truncate only have effect in fixed sizing (auto
    // modes hug content vertically — there's no slack to align in, and
    // truncate needs a constrained box). Paragraph spacing inserts margin
    // between hard-break-separated paragraphs.
    const va = n.verticalAlign || "top";
    // A text layer gets a definite height — and therefore vertical alignment
    // (top/middle/bottom) — when the user fixed its height OR auto layout is
    // stretching it (Fill on the vertical axis). Likewise a definite width
    // when it isn't hugging width (auto-h / fixed / Fill-width). Without this
    // a Fill text in an auto-layout frame ignored verticalAlign.
    const fillH = n.layoutSizingH === "fill";
    const fillV = n.layoutSizingV === "fill";
    const definiteH = sizingMode === "fixed" || fillV;
    const definiteW = sizingMode !== "auto-wh" || fillH;
    const vExtras = definiteH ? {
      display: "flex",
      flexDirection: "column",
      justifyContent: va === "middle" ? "center" : va === "bottom" ? "flex-end" : "flex-start",
    } : null;

    // Resolve line-height to a px value so we can compute how many lines
    // actually fit inside the (fixed) box for truncation.
    const fs = n.fontSize || 16;
    const lhVal = n.lineHeight;
    const lhUnit = n.lineHeightUnit;
    const lhPx = lhUnit === "px" ? (lhVal ?? fs * 1.2)
              : lhUnit === "%"  ? fs * ((lhVal ?? 120) / 100)
                                : fs * 1.2;
    const truncLines = n.truncate
      // User-supplied max lines wins; otherwise (Fixed mode only) fit to
      // box height. In auto-h / auto-wh modes there's no box to fit to,
      // so we fall back to 1 line if no max was set.
      ? (n.truncateLines && n.truncateLines > 0
          ? n.truncateLines
          : (definiteH ? Math.max(1, Math.floor(n.h / lhPx)) : 1))
      : 0;
    const truncExtras = truncLines ? {
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: truncLines,
      overflow: "hidden",
    } : null;
    const boxStyle = !definiteW
      ? { ...common, ...textStyle, whiteSpace: "pre", width: "max-content", height: "auto", overflow: "visible", ...truncExtras }
      : { ...common, ...textStyle, whiteSpace: "pre-wrap", wordWrap: "break-word",
          width: n.w, height: definiteH ? n.h : "auto",
          overflow: definiteH ? "hidden" : "visible", ...vExtras, ...truncExtras };

    // Render text. Each hard line-break (Enter once) is a paragraph; we wrap
    // each in its own <div> with the configured bottom margin so paragraph
    // spacing actually shows up. Soft-wrapped lines (CSS wrap, no \n) keep
    // their natural rhythm and are NOT spaced apart.
    //
    // When `truncate` is on we render a SINGLE flat string instead — the
    // line-clamp display mode (`-webkit-box`) only clamps a single block-
    // formatting context, so wrapping each paragraph in its own div would
    // disable ellipsis.
    const paraGap = n.paragraphSpacing || 0;
    const renderText = () => {
      if (!n.text) return n.placeholder ? <span style={{opacity:.4}}>{n.placeholder}</span> : "";
      if (paraGap <= 0 || truncLines) return n.text;
      const paras = n.text.split(/\n/);
      return paras.map((p, i) => (
        <div key={i} style={{ marginBottom: i < paras.length - 1 ? paraGap : 0 }}>{p || "\u00A0"}</div>
      ));
    };
    return <div style={boxStyle}>{renderText()}</div>;
  }
  if (n.type === "image") {
    // A real pasted/placed image (data URL or remote src) renders as an <img>;
    // otherwise fall back to the placeholder gradient + icon.
    if (n.src) {
      return (
        <div style={{ ...common, borderRadius: n.radius || 0, overflow: "hidden" }}>
          <img src={n.src} alt={n.name || "image"} draggable={false}
               style={{ width: "100%", height: "100%",
                        objectFit: n.objectFit || "cover",
                        display: "block", pointerEvents: "none",
                        userSelect: "none" }} />
        </div>
      );
    }
    const colorA = n.placeholderA || "#E5E5E5";
    const colorB = n.placeholderB || "#A3A3A3";
    return (
      <div style={{ ...common, background: `linear-gradient(135deg, ${colorA}, ${colorB})`,
                    borderRadius: n.radius || 0, overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={Math.min(48, n.w * 0.35)} height={Math.min(48, n.h * 0.35)} viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <circle cx="9" cy="10" r="1.5"/>
          <path d="M21 16l-5-5L5 19"/>
        </svg>
      </div>
    );
  }
  if (n.type === "pen") {
    const pts = n.points || [];
    if (pts.length < 2) return null;
    const d = penPathD(pts, n.closed);
    // A vector fills its enclosed region whenever a fill is set (SVG auto-closes
    // an open path for fill). The fill must be SVG-native: a solid becomes an
    // rgba color; a gradient becomes a <defs> entry referenced by url(). (The CSS
    // `background` string fillsCss() produces is NOT valid on an SVG fill attr —
    // feeding it a linear-gradient() makes SVG silently fall back to black.)
    const top = firstVisibleFill(n);
    let fillVal = "none";
    let defs = null;
    if (top) {
      if (top.type === "solid") {
        fillVal = hexToRgba(top.color, top.opacity ?? 1);
      } else {
        const gid = `pengrad-${n.id}`;
        fillVal = `url(#${gid})`;
        const stops = (top.stops || []).slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((s, i) => (
            <stop key={i} offset={`${((s.position ?? 0) * 100).toFixed(1)}%`}
                  stopColor={hexToRgba(s.color, (s.opacity ?? 1) * (top.opacity ?? 1))} />
          ));
        if (top.type === "radial") {
          defs = <defs><radialGradient id={gid} cx="50%" cy="50%" r="50%">{stops}</radialGradient></defs>;
        } else {
          const t = ((top.angle ?? 180) * Math.PI) / 180;
          const x1 = 0.5 - 0.5 * Math.sin(t), y1 = 0.5 + 0.5 * Math.cos(t);
          const x2 = 0.5 + 0.5 * Math.sin(t), y2 = 0.5 - 0.5 * Math.cos(t);
          defs = <defs><linearGradient id={gid} x1={x1} y1={y1} x2={x2} y2={y2}>{stops}</linearGradient></defs>;
        }
      }
    }
    return (
      <svg style={{ ...common, overflow: "visible" }} width={n.w} height={n.h}>
        {defs}
        <path d={d} fill={fillVal} {...strokeStyle} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (n.type === "comment") {
    return (
      <div style={{
        ...common, width: 28, height: 28, borderRadius: "50% 50% 50% 0",
        background: "var(--accent)", transform: "rotate(-45deg)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ transform: "rotate(45deg)", color: "white", fontSize: 12, fontWeight: 600 }}>1</span>
      </div>
    );
  }
  return null;
}

// ------------------------------------------------------------
// Rulers
// ------------------------------------------------------------
function Rulers({ pan, zoom, width, height, onGuideStart }) {
  // compute tick step based on zoom
  const step = (() => {
    const s = 100 * zoom;
    if (s > 140) return 50;
    if (s > 70) return 100;
    if (s > 35) return 200;
    if (s > 15) return 500;
    return 1000;
  })();
  const major = step;
  const horizTicks = [];
  const startX = Math.floor(-pan.x / zoom / major) * major;
  const endX = Math.ceil((width - pan.x) / zoom / major) * major;
  for (let x = startX; x <= endX; x += major) {
    const px = x * zoom + pan.x;
    if (px < 24 || px > width) continue;
    horizTicks.push(
      <div key={"h" + x} style={{ position: "absolute", left: px, top: 0, height: 24 }}>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 1, height: 6, background: "var(--ruler-line)" }} />
        <div style={{ position: "absolute", left: 3, bottom: 8, fontSize: 9, color: "var(--ruler-fg)" }}>{x}</div>
      </div>
    );
  }
  const vertTicks = [];
  const startY = Math.floor(-pan.y / zoom / major) * major;
  const endY = Math.ceil((height - pan.y) / zoom / major) * major;
  for (let y = startY; y <= endY; y += major) {
    const py = y * zoom + pan.y;
    if (py < 24 || py > height) continue;
    vertTicks.push(
      <div key={"v" + y} style={{ position: "absolute", top: py, left: 0, width: 24 }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 6, height: 1, background: "var(--ruler-line)" }} />
        <div style={{ position: "absolute", top: 3, right: 8, fontSize: 9, color: "var(--ruler-fg)",
                      writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{y}</div>
      </div>
    );
  }
  return (
    <>
      <div className="ruler-corner" />
      <div className="ruler-h" onMouseDown={(e) => onGuideStart?.("h", e)}>{horizTicks}</div>
      <div className="ruler-v" onMouseDown={(e) => onGuideStart?.("v", e)}>{vertTicks}</div>
    </>
  );
}

export { renderShape, Rulers };
