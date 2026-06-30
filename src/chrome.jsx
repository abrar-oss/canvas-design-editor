import React from "react";
import { Icon } from "./icons.jsx";
/* global React, Icon */
const { useState, useRef, useCallback, useEffect } = React;

// ============================================================
// macOS window + tabs + topbar
// ============================================================

function Chrome({ tabs, activeTab, onTabSelect, onTabAdd, onTabClose, children }) {
  return (
    <div className="os-window">
      <div className="os-titlebar">
        <div className="traffic-lights">
          <div className="traffic r" />
          <div className="traffic y" />
          <div className="traffic g" />
        </div>
        <div className="tabs">
          {tabs.map(t => (
            <div key={t.id}
                 className={`tab ${activeTab === t.id ? "active" : ""}`}
                 onClick={() => onTabSelect(t.id)}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              {tabs.length > 1 && (
                <div className="tab-close"
                     onClick={(e) => { e.stopPropagation(); onTabClose(t.id); }}>
                  <Icon.Close size={12} />
                </div>
              )}
            </div>
          ))}
          <div className="tab-add" onClick={onTabAdd} title="New file">
            <Icon.Plus size={14} />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function TopBar({ fileName, onFileNameChange, onUndo, onRedo, theme, onTheme, onTweaks, showTweaks }) {
  return (
    <div className="topbar">
      <div className="breadcrumb">{fileName} <span className="breadcrumb-sep">/</span> Page 1</div>

      <div className="spacer" />

      <button className="icon-btn" onClick={onUndo} title="Undo (⌘Z)"><Icon.Undo size={16} /></button>
      <button className="icon-btn" onClick={onRedo} title="Redo (⇧⌘Z)"><Icon.Redo size={16} /></button>

      <div className="topbar-divider" />

      <button className={`icon-btn ${showTweaks ? "active" : ""}`} onClick={onTweaks} title="Tweaks">
        <Icon.Sliders size={16} />
      </button>
      <button className="icon-btn" onClick={onTheme} title="Toggle theme">
        <Icon.Theme size={16} />
      </button>
      <button className="icon-btn" title="Comments"><Icon.Comment size={16} /></button>
    </div>
  );
}

export { Chrome, TopBar };
