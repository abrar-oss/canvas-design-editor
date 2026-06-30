import React from "react";
import { Icon } from "./icons.jsx";
import { makeInitialDoc, useHistory, AppCtx, uid } from "./utils.jsx";
import { Chrome, TopBar } from "./chrome.jsx";
import { LeftPanel } from "./leftPanel.jsx";
import { Canvas } from "./canvas.jsx";
import { ToolDock } from "./tools.jsx";
import { RightPanel } from "./rightPanel.jsx";
/* global React, ReactDOM, Icon, Chrome, TopBar, LeftPanel, Canvas, ToolDock, RightPanel, makeInitialDoc, useHistory, AppCtx, uid */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showRulers": true,
  "canvasBg": "#E5E5E5",
  "canvasBgDark": "#1A1A1A"
}/*EDITMODE-END*/;

function Tweaks({ tweaks, setTweaks, onClose }) {
  return (
    <div className="tweaks-panel">
      <h4>Tweaks <button className="icon-btn" onClick={onClose}><Icon.Close size={14}/></button></h4>
      <label className="check-row">
        <input type="checkbox" checked={tweaks.showRulers}
               onChange={e => setTweaks({ ...tweaks, showRulers: e.target.checked })}/>
        Show rulers
      </label>
      <div className="hr" />
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--app-fg-2)" }}>Canvas background (light)</div>
      <div className="fill-row">
        <div className="swatch"><div className="swatch-fill" style={{ background: tweaks.canvasBg }}/></div>
        <input className="hex-input" value={tweaks.canvasBg.replace("#","")}
               onChange={e => { const v = e.target.value; if (/^[0-9a-fA-F]{6}$/.test(v)) setTweaks({ ...tweaks, canvasBg: "#" + v }); }}/>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {["#FFFFFF","#F5F5F5","#E5E5E5","#D4D4D4","#0A0A0A"].map(c => (
          <div key={c} className="swatch" onClick={() => setTweaks({ ...tweaks, canvasBg: c })}>
            <div className="swatch-fill" style={{ background: c }}/>
          </div>
        ))}
      </div>
      <div className="hr" />
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--app-fg-2)" }}>Canvas background (dark)</div>
      <div className="fill-row">
        <div className="swatch"><div className="swatch-fill" style={{ background: tweaks.canvasBgDark }}/></div>
        <input className="hex-input" value={tweaks.canvasBgDark.replace("#","")}
               onChange={e => { const v = e.target.value; if (/^[0-9a-fA-F]{6}$/.test(v)) setTweaks({ ...tweaks, canvasBgDark: "#" + v }); }}/>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {["#0A0A0A","#171717","#1A1A1A","#262626","#000000"].map(c => (
          <div key={c} className="swatch" onClick={() => setTweaks({ ...tweaks, canvasBgDark: c })}>
            <div className="swatch-fill" style={{ background: c }}/>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  // Tabs / files — start with a single tab; users can add more with the "+" button.
  const [tabs, setTabs] = useState([
    { id: "t1", name: "Untitled" },
  ]);
  const [activeTabId, setActiveTabId] = useState("t1");
  const [fileNames, setFileNames] = useState({ t1: "Untitled" });

  // Per-tab doc (keep separate states so tabs persist their own work)
  const [docs, setDocs] = useState(() => {
    const obj = {};
    tabs.forEach(t => obj[t.id] = makeInitialDoc());
    return obj;
  });

  // Ensure active page
  useEffect(() => {
    setDocs(d => {
      const cur = d[activeTabId];
      if (cur && !cur.activePageId) {
        return { ...d, [activeTabId]: { ...cur, activePageId: cur.pages[0].id } };
      }
      return d;
    });
  }, [activeTabId]);

  const doc = docs[activeTabId];
  const setDoc = useCallback((fnOrVal) => {
    setDocs(d => ({ ...d, [activeTabId]: typeof fnOrVal === "function" ? fnOrVal(d[activeTabId]) : fnOrVal }));
  }, [activeTabId]);

  const activePageId = doc?.activePageId;
  const setActivePageId = (id) => setDoc(d => ({ ...d, activePageId: id }));

  // Selection per-tab
  const [selections, setSelections] = useState({});
  const selection = selections[activeTabId] || [];
  const setSelection = (s) => setSelections(sel => ({ ...sel, [activeTabId]: typeof s === "function" ? s(sel[activeTabId] || []) : s }));
  // Figma-style selection context: id of the frame that's "currently being edited".
  // Click selects nodes whose parent === this. null = page root.
  const [selCtxs, setSelCtxs] = useState({});
  const selCtx = selCtxs[activeTabId] || null;
  const setSelCtx = (id) => setSelCtxs(c => ({ ...c, [activeTabId]: id }));

  const [tool, setTool] = useState("select");
  const [mode, setMode] = useState("design");
  const [theme, setTheme] = useState("light");
  const [pan, setPan] = useState({ x: 200, y: 80 });
  const [zoom, setZoom] = useState(1);

  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [showTweaksPanel, setShowTweaksPanel] = useState(false);

  // History (per-tab — each tab has its own undo timeline)
  const history = useHistory(activeTabId, docs, setDocs);

  // Tab handlers
  const onTabAdd = () => {
    const id = uid(); // collision-proof (Date.now() % 1e6 collides on rapid adds)
    setTabs(t => [...t, { id, name: "Untitled" }]);
    setFileNames(n => ({ ...n, [id]: "Untitled" }));
    setDocs(d => ({ ...d, [id]: makeInitialDoc() }));
    setActiveTabId(id);
  };
  const onTabClose = (id) => {
    // Don't allow closing the last remaining tab.
    if (tabs.length <= 1) return;
    setTabs(t => t.filter(x => x.id !== id));
    if (activeTabId === id) {
      const others = tabs.filter(x => x.id !== id);
      if (others.length) setActiveTabId(others[0].id);
    }
    // Clean up per-tab state so closed tabs don't leak forever.
    setDocs(d => { const { [id]: _, ...rest } = d; return rest; });
    setSelections(s => { const { [id]: _, ...rest } = s; return rest; });
    setSelCtxs(c => { const { [id]: _, ...rest } = c; return rest; });
    setFileNames(n => { const { [id]: _, ...rest } = n; return rest; });
    history.dropKey(id);
  };

  const onFileNameChange = (v) => {
    setFileNames(n => ({ ...n, [activeTabId]: v }));
    setTabs(t => t.map(x => x.id === activeTabId ? { ...x, name: v } : x));
  };

  const fitZoom = () => { setZoom(1); setPan({ x: 200, y: 80 }); };

  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");

  // Edit-mode (Tweaks) protocol
  useEffect(() => {
    const listener = (e) => {
      if (e.data?.type === "__activate_edit_mode") setShowTweaksPanel(true);
      if (e.data?.type === "__deactivate_edit_mode") setShowTweaksPanel(false);
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: tweaks }, "*");
  }, [tweaks]);

  // Global keyboard: Shift+R toggles rulers (matches Figma's shortcut).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      // Ignore when typing into inputs / contentEditables.
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setTweaks(tw => ({ ...tw, showRulers: !tw.showRulers }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const canvasBg = theme === "dark" ? tweaks.canvasBgDark : tweaks.canvasBg;

  const ctxValue = {
    doc, setDoc, activePageId, setActivePageId,
    selection, setSelection, selCtx, setSelCtx,
    tool, setTool,
    mode, setMode,
    history,
    rulers: tweaks.showRulers,
    canvasBg,
    pan, setPan, zoom, setZoom, fitZoom,
    theme, toggleTheme,
    fileName: fileNames[activeTabId] || "Untitled",
    setFileName: onFileNameChange,
  };

  if (!doc || !doc.activePageId) return null;

  return (
    <AppCtx.Provider value={ctxValue}>
      <Chrome tabs={tabs} activeTab={activeTabId}
              onTabSelect={setActiveTabId}
              onTabAdd={onTabAdd}
              onTabClose={onTabClose}>
        <div className="body-area">
          <LeftPanel />
          <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <Canvas />
            <ToolDock />
          </div>
          <RightPanel />
        </div>
      </Chrome>
      {showTweaksPanel && (
        <Tweaks tweaks={tweaks} setTweaks={setTweaks} onClose={() => setShowTweaksPanel(false)} />
      )}
    </AppCtx.Provider>
  );
}

export { App };
