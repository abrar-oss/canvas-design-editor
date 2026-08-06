import React from "react";
import { Icon } from "./icons.jsx";
import { useApp } from "./utils.jsx";
/* global React, Icon, useApp */
const { useState, useEffect, useRef } = React;

// Figma-style hover tooltip shown above a tool button: the tool name plus a
// dim shortcut key. Rendered inside the button; CSS fades it in on hover.
const Tip = ({ label, shortcut }) => (
  <span className="tool-tip" role="tooltip">
    {label}{shortcut ? <kbd>{shortcut}</kbd> : null}
  </span>
);

const TOOLS = [
  // Move group — Move / Hand / Scale share one slot with a flyout (Figma).
  { id: "move", label: "Move", default: "select", options: [
    { id: "select", icon: Icon.Cursor, label: "Move", shortcut: "V" },
    { id: "hand",   icon: Icon.Hand,   label: "Hand tool", shortcut: "H" },
    { id: "scale",  icon: Icon.Scale,  label: "Scale", shortcut: "K" },
  ]},
  { id: "frame",  icon: Icon.Frame,  label: "Frame", shortcut: "F" },
  { id: "shape",  label: "Shape", default: "rect", options: [
    { id: "rect", icon: Icon.Rect, label: "Rectangle", shortcut: "R" },
    { id: "ellipse", icon: Icon.Ellipse, label: "Ellipse", shortcut: "O" },
    { id: "line", icon: Icon.Line, label: "Line", shortcut: "L" },
    { id: "polygon", icon: Icon.Polygon, label: "Polygon", shortcut: "" },
    { id: "star", icon: Icon.Star, label: "Star", shortcut: "" },
  ]},
  { id: "pen",   icon: Icon.Pen,   label: "Pen", shortcut: "P" },
  { id: "text",  icon: Icon.Text,  label: "Text", shortcut: "T" },
  // Swatch group — Swatch (image) / Rating (star) share one slot with a flyout.
  { id: "swatch", label: "Swatch", default: "image", options: [
    { id: "image",  icon: Icon.Image,  label: "Swatch", shortcut: "S" },
    { id: "rating", icon: Icon.Rating, label: "Rating", shortcut: "" },
  ]},
  { id: "comment", icon: Icon.Comment, label: "Comment", shortcut: "C" },
];

// One dock slot: an icon button (the only part that highlights when active)
// PLUS a visually separate chevron to its right. Tools with `options` open a
// flyout from the chevron; single tools have a decorative chevron that just
// re-selects the tool.
function ToolSlot({ tool: t }) {
  const { tool, setTool } = useApp();
  const hasOptions = Array.isArray(t.options) && t.options.length > 0;
  const optionIds = hasOptions ? t.options.map(o => o.id) : [t.id];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(hasOptions ? (t.default || optionIds[0]) : t.id);
  const ref = useRef(null);

  // Keep the primary icon in sync when a member is activated by shortcut.
  useEffect(() => { if (optionIds.includes(tool)) setActive(tool); }, [tool]);

  // Close the flyout on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const slotActive = optionIds.includes(tool);
  const activeOpt = hasOptions ? (t.options.find(o => o.id === active) || t.options[0]) : null;
  const ActiveIcon = hasOptions ? activeOpt.icon : t.icon;
  const primaryTool = hasOptions ? active : t.id;

  // Plain tool (no sub-options) — a single icon button, no chevron. Chevrons
  // are reserved for slots that actually open a flyout.
  if (!hasOptions) {
    const Ic = t.icon;
    return (
      <button className={`tool-btn ${tool === t.id ? "active" : ""}`}
              onClick={() => setTool(t.id)} aria-label={t.label}>
        <Ic size={20} />
        <Tip label={t.label} shortcut={t.shortcut} />
      </button>
    );
  }

  // Grouped tool — icon button + a visually separate chevron that opens a flyout.
  return (
    <div ref={ref} className="tool-slot">
      <button className={`tool-btn ${slotActive ? "active" : ""}`}
              onClick={() => setTool(primaryTool)} aria-label={activeOpt.label}>
        <ActiveIcon size={20} />
        <Tip label={activeOpt.label} shortcut={activeOpt.shortcut} />
      </button>
      <button className={`tool-chevron ${open ? "open" : ""}`}
              onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
              title={`${t.label} options`} tabIndex={-1}>
        <Icon.Chevron size={18} />
      </button>
      {open && (
        <div className="tool-menu">
          {t.options.map(opt => {
            const I = opt.icon;
            return (
              <div key={opt.id}
                   className="tool-menu-item"
                   onClick={() => { setActive(opt.id); setTool(opt.id); setOpen(false); }}>
                <span className="tool-menu-check">{tool === opt.id ? <Icon.Check size={13} /> : null}</span>
                <I size={16} /> {opt.label}
                <span className="shortcut">{opt.shortcut}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolDock() {
  return (
    <div className="tool-dock">
      {TOOLS.map(t => <ToolSlot key={t.id} tool={t} />)}
    </div>
  );
}

export { ToolDock };
