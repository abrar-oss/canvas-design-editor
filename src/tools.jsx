import React from "react";
import { Icon } from "./icons.jsx";
import { useApp } from "./utils.jsx";
/* global React, Icon, useApp */
const { useState, useEffect } = React;

const TOOLS = [
  { id: "select", icon: Icon.Cursor, label: "Move", shortcut: "V" },
  { id: "frame",  icon: Icon.Frame,  label: "Frame", shortcut: "F" },
  { id: "shape",  group: true, icon: Icon.Rect, label: "Shape", options: [
    { id: "rect", icon: Icon.Rect, label: "Rectangle", shortcut: "R" },
    { id: "ellipse", icon: Icon.Ellipse, label: "Ellipse", shortcut: "O" },
    { id: "line", icon: Icon.Line, label: "Line", shortcut: "L" },
    { id: "polygon", icon: Icon.Polygon, label: "Polygon", shortcut: "" },
    { id: "star", icon: Icon.Star, label: "Star", shortcut: "" },
  ]},
  { id: "pen",   icon: Icon.Pen,   label: "Pen", shortcut: "P" },
  { id: "text",  icon: Icon.Text,  label: "Text", shortcut: "T" },
  { id: "image", icon: Icon.Image, label: "Image", shortcut: "I" },
  { id: "hand",  icon: Icon.Hand,  label: "Hand", shortcut: "H" },
  { id: "comment", icon: Icon.Comment, label: "Comment", shortcut: "C" },
];

function ToolDock() {
  const { tool, setTool } = useApp();
  const [shapeMenu, setShapeMenu] = useState(false);
  const [activeShape, setActiveShape] = useState("rect");

  // Keep the group button in sync when a shape tool is activated by shortcut
  // (R/O/L) or anywhere else — not just via the flyout menu.
  useEffect(() => {
    if (["rect", "ellipse", "line", "polygon", "star"].includes(tool)) setActiveShape(tool);
  }, [tool]);

  const ShapeIcon = { rect: Icon.Rect, ellipse: Icon.Ellipse, line: Icon.Line, polygon: Icon.Polygon, star: Icon.Star }[activeShape] || Icon.Rect;

  return (
    <div className="tool-dock">
      {TOOLS.map((t, i) => {
        if (t.group) {
          const active = ["rect","ellipse","line","polygon","star"].includes(tool);
          return (
            <div key={t.id} style={{ position: "relative" }}>
              <button
                className={`tool-btn ${active ? "active" : ""}`}
                onClick={() => setTool(activeShape)}
                title={t.label}
              >
                <ShapeIcon size={16} />
                <span className="tool-caret" onClick={(e) => { e.stopPropagation(); setShapeMenu(v => !v); }} />
              </button>
              {shapeMenu && (
                <div className="tool-menu">
                  {t.options.map(opt => {
                    const I = opt.icon;
                    return (
                      <div key={opt.id}
                           className="tool-menu-item"
                           onClick={() => { setActiveShape(opt.id); setTool(opt.id); setShapeMenu(false); }}>
                        <I size={14} /> {opt.label}
                        <span className="shortcut">{opt.shortcut}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        const Ic = t.icon;
        return (
          <button key={t.id}
                  className={`tool-btn ${tool === t.id ? "active" : ""}`}
                  onClick={() => setTool(t.id)}
                  title={`${t.label} (${t.shortcut})`}>
            <Ic size={16} />
          </button>
        );
      })}
    </div>
  );
}

export { ToolDock };
