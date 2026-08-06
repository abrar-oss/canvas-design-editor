import React from "react";
import { Icon } from "./icons.jsx";
import { useApp } from "./utils.jsx";
/* global React, Icon, useApp */
const { useState, useEffect, useRef } = React;

const TOOLS = [
  // Move group — Move / Hand / Scale share one dock slot with a flyout (Figma).
  { id: "move", group: true, label: "Move", default: "select", options: [
    { id: "select", icon: Icon.Cursor, label: "Move", shortcut: "V" },
    { id: "hand",   icon: Icon.Hand,   label: "Hand tool", shortcut: "H" },
    { id: "scale",  icon: Icon.Scale,  label: "Scale", shortcut: "K" },
  ]},
  { id: "frame",  icon: Icon.Frame,  label: "Frame", shortcut: "F" },
  { id: "shape",  group: true, label: "Shape", default: "rect", options: [
    { id: "rect", icon: Icon.Rect, label: "Rectangle", shortcut: "R" },
    { id: "ellipse", icon: Icon.Ellipse, label: "Ellipse", shortcut: "O" },
    { id: "line", icon: Icon.Line, label: "Line", shortcut: "L" },
    { id: "polygon", icon: Icon.Polygon, label: "Polygon", shortcut: "" },
    { id: "star", icon: Icon.Star, label: "Star", shortcut: "" },
  ]},
  { id: "pen",   icon: Icon.Pen,   label: "Pen", shortcut: "P" },
  { id: "text",  icon: Icon.Text,  label: "Text", shortcut: "T" },
  { id: "image", icon: Icon.Image, label: "Image", shortcut: "I" },
  { id: "comment", icon: Icon.Comment, label: "Comment", shortcut: "C" },
];

// A grouped tool: a primary button (showing the last-used member) with a
// chevron that opens a flyout of the member tools. Used for both the Move
// (Move/Hand/Scale) and Shape (Rectangle/Ellipse/…) groups.
function ToolGroup({ group }) {
  const { tool, setTool } = useApp();
  const optionIds = group.options.map(o => o.id);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(group.default || optionIds[0]);
  const ref = useRef(null);

  // Keep the primary button in sync when a member is activated by shortcut
  // (V/H/K, R/O/L) or anywhere else — not just via the flyout.
  useEffect(() => { if (optionIds.includes(tool)) setActive(tool); }, [tool]);

  // Close the flyout on outside click or Escape.
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

  const groupActive = optionIds.includes(tool);
  const ActiveIcon = (group.options.find(o => o.id === active) || group.options[0]).icon;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`tool-btn has-caret ${groupActive ? "active" : ""}`}
              onClick={() => setTool(active)} title={group.label}>
        <ActiveIcon size={20} />
        <span className={`tool-caret ${open ? "open" : ""}`}
              onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}>
          <Icon.Chevron size={14} />
        </span>
      </button>
      {open && (
        <div className="tool-menu">
          {group.options.map(opt => {
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
  const { tool, setTool } = useApp();
  return (
    <div className="tool-dock">
      {TOOLS.map(t => {
        if (t.group) return <ToolGroup key={t.id} group={t} />;
        const Ic = t.icon;
        return (
          <button key={t.id}
                  className={`tool-btn ${tool === t.id ? "active" : ""}`}
                  onClick={() => setTool(t.id)}
                  title={`${t.label} (${t.shortcut})`}>
            <Ic size={20} />
          </button>
        );
      })}
    </div>
  );
}

export { ToolDock };
