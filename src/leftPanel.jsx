import React from "react";
import { Icon } from "./icons.jsx";
import { useApp, uid } from "./utils.jsx";
import { exportDesign } from "./exportDesign.js";
/* global React, Icon, useApp, uid */
const { useState, useMemo, useCallback, useEffect, useRef } = React;

function LeftPanel() {
  const { doc, setDoc, selection, setSelection, activePageId, setActivePageId, history, fileName, setFileName, setTool } = useApp();
  const [tab, setTab] = useState("layers");
  // Page being inline-renamed (id) and its draft value.
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingPageName, setEditingPageName] = useState("");
  const [editingFileName, setEditingFileName] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  // Drag state: { id, intent: "before"|"after"|"inside", targetId }
  const [drag, setDrag] = useState(null);
  // Main (logo) menu — opens the Figma-style app menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSub, setOpenSub] = useState(null); // which top item's submenu is open
  const menuRef = useRef(null);

  // Collapse any open submenu whenever the main menu closes.
  useEffect(() => { if (!menuOpen) setOpenSub(null); }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const page = doc.pages.find(p => p.id === activePageId);
  const all = page?.children || [];

  // Build tree once per render
  const { byParent, byId } = useMemo(() => {
    const byParent = {}, byId = {};
    all.forEach(n => {
      byId[n.id] = n;
      const pid = n.parentId || "__root__";
      (byParent[pid] = byParent[pid] || []).push(n);
    });
    return { byParent, byId };
  }, [all]);

  // Set of ids whose ancestor chain contains a selected node — used to soft-highlight.
  const inSelectedSubtree = useMemo(() => {
    const set = new Set();
    const isSel = new Set(selection);
    all.forEach(n => {
      let cur = n.parentId;
      while (cur) {
        if (isSel.has(cur)) { set.add(n.id); break; }
        cur = byId[cur]?.parentId;
      }
    });
    return set;
  }, [all, selection, byId]);

  const toggleSelect = (id, additive) => {
    if (additive) setSelection(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
    else setSelection([id]);
  };

  const patch = (id, p) => setDoc(d => ({
    ...d,
    pages: d.pages.map(pg => pg.id === activePageId
      ? { ...pg, children: pg.children.map(c => c.id === id ? { ...c, ...p } : c) }
      : pg)
  }));

  const addPage = () => setDoc(d => {
    const np = { id: uid(), name: `Page ${d.pages.length + 1}`, children: [] };
    return { ...d, pages: [...d.pages, np] };
  });

  // Delete a page. Refuses to remove the last remaining page (need at least one),
  // and switches the active page to a neighbor if we're deleting the active one.
  const deletePage = (pageId) => {
    if (doc.pages.length <= 1) return;
    const idx = doc.pages.findIndex(p => p.id === pageId);
    if (idx === -1) return;
    const pg = doc.pages[idx];
    if (pg.children.length > 0) {
      if (!window.confirm(`Delete "${pg.name}"? This will remove ${pg.children.length} layer${pg.children.length === 1 ? "" : "s"}.`)) return;
    }
    history.snapshot();
    setDoc(d => {
      const remaining = d.pages.filter(p => p.id !== pageId);
      const nextActive = d.activePageId === pageId
        ? (remaining[idx] || remaining[idx - 1] || remaining[0]).id
        : d.activePageId;
      return { ...d, pages: remaining, activePageId: nextActive };
    });
    if (activePageId === pageId) setSelection([]);
    history.commit();
  };

  // Inline-rename: double-click a page name to edit it.
  const startRenamePage = (p) => {
    setEditingPageId(p.id);
    setEditingPageName(p.name);
  };
  const commitRenamePage = () => {
    if (!editingPageId) return;
    const name = editingPageName.trim();
    if (name) {
      history.snapshot();
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => p.id === editingPageId ? { ...p, name } : p),
      }));
      history.commit();
    }
    setEditingPageId(null);
  };
  const cancelRenamePage = () => setEditingPageId(null);

  // ============================================================
  // Drag & drop — reorder z-index and re-parent.
  //
  // Array order is BOTTOM-UP (last in array = drawn on top = top of panel).
  // The panel reverses on render. So "drop A above B" means A goes AFTER B
  // in the array. We always work with the array directly.
  //
  // Drop intent based on Y-within-row:
  //   top 25%    → insert BEFORE target (above in panel)
  //   bottom 25% → insert AFTER target  (below in panel)
  //   middle 50% → insert INTO target   (only for frames)
  // ============================================================
  const isDescendant = useCallback((ancestorId, nodeId) => {
    let cur = byId[nodeId];
    while (cur?.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = byId[cur.parentId];
    }
    return false;
  }, [byId]);

  const computeIntent = (e, target) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    const h = r.height;
    if (target.type === "frame" && y > h * 0.25 && y < h * 0.75) return "inside";
    return y < h / 2 ? "before" : "after";
  };

  const onRowDragStart = (e, node) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.id);
    setDrag({ id: node.id, intent: null, targetId: null });
  };

  const onRowDragOver = (e, target) => {
    if (!drag || drag.id === target.id) return;
    // Can't drop onto self or your own descendant.
    if (isDescendant(drag.id, target.id) || drag.id === target.id) return;
    e.preventDefault();
    // Stop the event bubbling to the list container's onListDragOver, which
    // would otherwise override our before/after/inside intent with "root".
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const intent = computeIntent(e, target);
    if (drag.intent !== intent || drag.targetId !== target.id) {
      setDrag(d => ({ ...d, intent, targetId: target.id }));
    }
  };

  const onRowDragLeave = () => { /* cleared on next dragover; keep state */ };

  const onRowDrop = (e, target) => {
    e.preventDefault();
    // Don't let the drop bubble to the list container's onListDrop, which would
    // re-run applyDrop with "root" and eject the node out of its frame.
    e.stopPropagation();
    if (!drag || drag.id === target.id) { setDrag(null); return; }
    if (isDescendant(drag.id, target.id)) { setDrag(null); return; }
    const intent = computeIntent(e, target);
    applyDrop(drag.id, target.id, intent);
    setDrag(null);
  };

  // Empty-area drop = move to root, append to end (top of panel).
  const onListDragOver = (e) => {
    if (!drag) return;
    e.preventDefault();
    if (drag.targetId !== "__root_end__") {
      setDrag(d => ({ ...d, intent: "root", targetId: "__root_end__" }));
    }
  };
  const onListDrop = (e) => {
    if (!drag) return;
    e.preventDefault();
    // Drop on empty list area = move to root level, place on top
    applyDrop(drag.id, null, "root");
    setDrag(null);
  };

  const applyDrop = (sourceId, targetId, intent) => {
    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(pg => {
        if (pg.id !== activePageId) return pg;
        const src = pg.children.find(c => c.id === sourceId);
        if (!src) return pg;

        // Resolve target parent + insertion position in array.
        let newParentId, position;
        if (intent === "root") {
          newParentId = null;
          // append to end (top of panel)
          position = pg.children.filter(c => (c.parentId || null) === null).length;
        } else {
          const tgt = pg.children.find(c => c.id === targetId);
          if (!tgt) return pg;
          if (intent === "inside") {
            newParentId = tgt.id;
            position = pg.children.filter(c => c.parentId === tgt.id).length; // append (top)
          } else {
            newParentId = tgt.parentId || null;
            const siblings = pg.children.filter(c => (c.parentId || null) === newParentId && c.id !== sourceId);
            const tgtIdx = siblings.findIndex(c => c.id === tgt.id);
            // "before" = above in panel = AFTER in array (panel reverses).
            // "after"  = below in panel = BEFORE in array.
            position = intent === "before" ? tgtIdx + 1 : tgtIdx;
          }
        }

        // 1. Decide whether to translate source + descendants so the dropped
        //    layer remains visible inside its new parent.
        //
        //    World coords are absolute; the renderer draws children at
        //    `c.x - parent.x`. A frame with overflow:hidden will CLIP anything
        //    whose world coords place it outside that frame's bounds — so a
        //    naive "just relink the parent" can make the dropped layer
        //    visually disappear.
        //
        //    Rule: if the source's center is already inside the new parent
        //    frame, leave coords alone (preserves on-screen position). If not,
        //    translate so the source's top-left lands a few px inside the
        //    parent's top-left — guaranteeing visibility.
        let dx = 0, dy = 0;
        if (newParentId) {
          const newParent = pg.children.find(c => c.id === newParentId);
          if (newParent) {
            const cx = src.x + src.w / 2;
            const cy = src.y + src.h / 2;
            const centerInside =
              cx >= newParent.x && cx <= newParent.x + newParent.w &&
              cy >= newParent.y && cy <= newParent.y + newParent.h;
            if (!centerInside) {
              dx = (newParent.x + 8) - src.x;
              dy = (newParent.y + 8) - src.y;
            }
          }
        }

        // Collect source + all descendants so the translation moves the entire
        // subtree together (a frame brings its kids).
        const descendantIds = new Set([sourceId]);
        let added = true;
        while (added) {
          added = false;
          pg.children.forEach(c => {
            if (c.parentId && descendantIds.has(c.parentId) && !descendantIds.has(c.id)) {
              descendantIds.add(c.id); added = true;
            }
          });
        }
        const translate = (c) => (dx || dy) && descendantIds.has(c.id)
          ? { ...c, x: c.x + dx, y: c.y + dy }
          : c;

        // 2. Rebuild children array: remove source from old position, insert at new.
        const others = pg.children.filter(c => c.id !== sourceId).map(translate);
        // Recompute insertion index against `others`:
        const siblingsAfter = others.filter(c => (c.parentId || null) === newParentId);
        const insertSiblingIdx = Math.min(position, siblingsAfter.length);
        // Find the absolute index in `others` of the sibling at insertSiblingIdx.
        let insertAbsIdx;
        if (insertSiblingIdx >= siblingsAfter.length) {
          // append after last sibling of newParent, or at end if none
          if (siblingsAfter.length === 0) {
            insertAbsIdx = others.length;
          } else {
            const lastSib = siblingsAfter[siblingsAfter.length - 1];
            insertAbsIdx = others.indexOf(lastSib) + 1;
          }
        } else {
          insertAbsIdx = others.indexOf(siblingsAfter[insertSiblingIdx]);
        }

        const newSrc = translate({ ...src, parentId: newParentId });
        const next = [...others.slice(0, insertAbsIdx), newSrc, ...others.slice(insertAbsIdx)];
        return { ...pg, children: next };
      })
    }));
    history.commit();
  };

  const renderTree = (parentId, depth) => {
    const kids = byParent[parentId || "__root__"] || [];
    const filtered = search ? kids.filter(n => n.name.toLowerCase().includes(search.toLowerCase())) : kids;
    // Reverse for visual top-down (last drawn at top in Figma)
    return [...filtered].reverse().map(n => {
      const hasKids = (byParent[n.id] || []).length > 0;
      const isCollapsed = collapsed[n.id];
      const isFrame = n.type === "frame";
      const isDragSource = drag?.id === n.id;
      const isDragTarget = drag?.targetId === n.id && !isDragSource;
      return (
        <React.Fragment key={n.id}>
          <LayerRow
            node={n}
            depth={depth}
            hasKids={hasKids}
            collapsed={isCollapsed}
            isFrame={isFrame}
            inSelectedSubtree={inSelectedSubtree.has(n.id)}
            dragSource={isDragSource}
            dragIntent={isDragTarget ? drag.intent : null}
            onToggleCollapse={() => setCollapsed(c => ({ ...c, [n.id]: !c[n.id] }))}
            selected={selection.includes(n.id)}
            onSelect={(e) => toggleSelect(n.id, e.shiftKey)}
            onRename={(name) => patch(n.id, { name })}
            onToggleVisible={() => patch(n.id, { hidden: !n.hidden })}
            onToggleLock={() => patch(n.id, { locked: !n.locked })}
            onDragStart={(e) => onRowDragStart(e, n)}
            onDragOver={(e) => onRowDragOver(e, n)}
            onDragLeave={onRowDragLeave}
            onDrop={(e) => onRowDrop(e, n)}
            onDragEnd={() => setDrag(null)}
          />
          {hasKids && !isCollapsed && renderTree(n.id, depth + 1)}
        </React.Fragment>
      );
    });
  };

  // File > Export — export the whole page as PNG (union bbox of root nodes).
  const exportWholePage = async () => {
    const world = document.querySelector(".canvas-world");
    const roots = world ? [...world.children].filter(c => c.getAttribute && c.getAttribute("data-node-id")) : [];
    if (!roots.length) { window.alert("Nothing to export."); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    roots.forEach(el => {
      const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    });
    const bw = Math.max(1, Math.round(maxX - minX)), bh = Math.max(1, Math.round(maxY - minY));
    try {
      await exportDesign({
        el: world, format: "png", scale: 2, name: fileName || "design", width: bw, height: bh,
        capture: { width: bw, height: bh, cloneTransform: `translate(${-minX}px, ${-minY}px)` },
      });
    } catch (e) { console.error("Export failed:", e); window.alert("Export failed: " + (e && e.message || e)); }
  };

  // Data-driven submenus for the main (logo) menu. `sep` = divider,
  // `shortcut` = right-aligned key hint, `caret` = has a nested menu,
  // `disabled` = greyed/inert, `run` = action (else the row is display-only).
  const SUBMENUS = {
    File: [
      { label: "New Design", run: () => setTool("frame") },
      { label: "Image place holder", run: () => setTool("image") },
      { label: "Export", run: () => exportWholePage() },
    ],
    Edit: [
      { label: "Undo", shortcut: "⌘Z", run: () => history.undo() },
      { label: "Redo", shortcut: "⇧⌘Z", run: () => history.redo() },
      { sep: true },
      { label: "Cut", shortcut: "⌘X" },
      { label: "Copy", shortcut: "⌘C" },
      { label: "Copy As", caret: true },
      { label: "Paste", shortcut: "⌘V" },
      { label: "Paste Over Selection", shortcut: "⇧⌘V" },
      { label: "Paste to Replace", shortcut: "⇧⌘R" },
      { label: "Duplicate", shortcut: "⌘D" },
      { label: "Delete", shortcut: "⌫" },
      { sep: true },
      { label: "Find", shortcut: "⌘F" },
      { label: "Find Next", shortcut: "⇧⌘F" },
      { label: "Find Previous", shortcut: "⇧⌘D" },
      { label: "Find and Replace…" },
      { sep: true },
      { label: "Set Default Properties" },
      { label: "Copy Properties", shortcut: "⌥⌘C" },
      { label: "Paste Properties", shortcut: "⌥⌘V" },
      { sep: true },
      { label: "Pick Color", shortcut: "⌃C" },
      { sep: true },
      { label: "Select All", shortcut: "⌘A", run: () => page && setSelection(page.children.map(n => n.id)) },
      { label: "Select Matching Layers", shortcut: "⌥⌘A", disabled: true },
      { label: "Select None", run: () => setSelection([]) },
      { label: "Select Inverse", shortcut: "⇧⌘A" },
      { label: "Select All With", caret: true },
    ],
  };

  return (
    <div className="panel left-panel">
      <div className="lp-head">
        <div className="lp-head-top">
          <div className="lp-logo-wrap" ref={menuRef}>
            <button className={`lp-logo ${menuOpen ? "open" : ""}`} aria-label="Main menu"
                    title="Main menu" onClick={() => setMenuOpen(v => !v)}>
              <svg width="24" height="15" viewBox="0 0 128 82" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M87.46 0V0.04H70.41V81.21H87.46C109.61 81.21 127.56 63.05 127.56 40.6C127.56 18.15 109.62 0 87.46 0ZM0 60.13C0 71.78 9.44 81.22 21.09 81.22V59.88H0V60.14V60.13ZM32.35 3.71H0V29.35H17.3L40.43 81.22L40.39 81.27H70.37L35.84 3.71H32.35Z" fill="currentColor"/>
              </svg>
              <Icon.Chevron size={12} />
            </button>
            {menuOpen && (
              <div className="main-menu" role="menu">
                <div className="mm-search">
                  <Icon.Search size={14} />
                  <input autoFocus placeholder="Actions..." />
                  <span className="mm-kbd">⌘K</span>
                </div>
                <div className="mm-group">
                  {["File", "Edit", "View", "Object", "Text", "Arrange", "Vector"].map(label => {
                    const sub = SUBMENUS[label];
                    if (!sub) {
                      return (
                        <button key={label} className="mm-item" role="menuitem">
                          <span>{label}</span><Icon.ChevronR size={14} />
                        </button>
                      );
                    }
                    return (
                      <div key={label} className="mm-item-wrap"
                           onMouseEnter={() => setOpenSub(label)}
                           onMouseLeave={() => setOpenSub(null)}>
                        <button className={`mm-item ${openSub === label ? "hover" : ""}`} role="menuitem">
                          <span>{label}</span><Icon.ChevronR size={14} />
                        </button>
                        {openSub === label && (
                          <div className="main-menu mm-sub" role="menu">
                            <div className="mm-group">
                              {sub.map((o, i) => o.sep ? (
                                <div key={`sep-${i}`} className="mm-sep" />
                              ) : (
                                <button key={o.label}
                                        className={`mm-item ${o.disabled ? "disabled" : ""}`}
                                        role="menuitem"
                                        disabled={o.disabled}
                                        onClick={o.disabled || o.caret ? undefined
                                          : () => { o.run && o.run(); setMenuOpen(false); }}>
                                  <span>{o.label}</span>
                                  {o.caret
                                    ? <Icon.ChevronR size={14} />
                                    : (o.shortcut ? <span className="mm-kbd">{o.shortcut}</span> : null)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mm-sep" />
                <div className="mm-group">
                  {["Help and account"].map(label => (
                    <button key={label} className="mm-item" role="menuitem">
                      <span>{label}</span><Icon.ChevronR size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="icon-btn lp-collapse" title="Collapse panel"><Icon.PanelLeft size={16} /></button>
        </div>
        <div className="lp-file">
          {editingFileName ? (
            <input
              className="lp-file-input"
              autoFocus
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onBlur={() => setEditingFileName(false)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingFileName(false); }}
            />
          ) : (
            <button className="lp-file-name" onClick={() => setEditingFileName(true)} title="Rename file">
              <span>{fileName}</span>
              <Icon.Chevron size={18} />
            </button>
          )}
          <div className="lp-file-sub">Drafts</div>
        </div>
      </div>

      <div className="lp-tabs-row">
        <div className="lp-tabs">
          <button className={`lp-tab ${tab === "layers" ? "active" : ""}`} onClick={() => setTab("layers")}>File</button>
          <button className={`lp-tab ${tab === "assets" ? "active" : ""}`} onClick={() => setTab("assets")}>Assets</button>
        </div>
        <button className={`icon-btn lp-search-btn ${searchOpen ? "on" : ""}`}
                onClick={() => setSearchOpen(s => !s)} title="Search">
          <Icon.Search size={16} />
        </button>
      </div>

      {searchOpen && (
        <div className="search-box">
          <Icon.Search size={14} />
          <input autoFocus placeholder={tab === "layers" ? "Search layers" : "Search assets"}
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {tab === "layers" ? (
        <>
          <div className="panel-section">
            <div className="section-header">
              <span>Pages</span>
              <div className="actions"><button className="icon-btn" onClick={addPage}><Icon.Plus size={16}/></button></div>
            </div>
            <div className="pages-list">
              {doc.pages.map(p => (
                <div key={p.id}
                     className={`page-item ${p.id === activePageId ? "active" : ""}`}
                     onClick={() => { if (editingPageId !== p.id) setActivePageId(p.id); }}
                     onDoubleClick={() => startRenamePage(p)}>
                  {editingPageId === p.id ? (
                    <input
                      className="page-rename-input"
                      autoFocus
                      value={editingPageName}
                      onChange={(e) => setEditingPageName(e.target.value)}
                      onBlur={commitRenamePage}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") commitRenamePage();
                        if (e.key === "Escape") cancelRenamePage();
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  ) : (
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  )}
                  {doc.pages.length > 1 && editingPageId !== p.id && (
                    <button
                      className="page-delete"
                      title="Delete page"
                      onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}
                    >
                      <Icon.Close size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="section-header">
            <span>Layers</span>
          </div>
          <div className="layer-list"
               onDragOver={onListDragOver}
               onDrop={onListDrop}>
            {all.length === 0 && (
              <div style={{ padding: "20px 14px", color: "var(--app-fg-3)", fontSize: 11, textAlign: "center" }}>
                No layers yet.
              </div>
            )}
            {renderTree(null, 0)}
          </div>
        </>
      ) : (
        <div style={{ padding: 14, color: "var(--app-fg-3)", fontSize: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {["Logo", "Button", "Card", "Chart"].map(n => (
              <div key={n} style={{
                height: 72, background: "var(--app-panel-2)", borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: "var(--app-fg-2)", border: "1px solid var(--app-border)"
              }}>{n}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  node, depth, hasKids, collapsed, isFrame, inSelectedSubtree,
  dragSource, dragIntent,
  onToggleCollapse, selected, onSelect, onRename, onToggleVisible, onToggleLock,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);

  const IconKind = {
    frame: Icon.Frame, rect: Icon.Rect, ellipse: Icon.Ellipse,
    line: Icon.Line, polygon: Icon.Polygon, star: Icon.Star,
    text: Icon.Text, image: Icon.Image, pen: Icon.Pen, comment: Icon.Comment,
  }[node.type] || Icon.Rect;
  // A shape whose fill is an image (e.g. a pasted photo) reads as an image.
  const hasImageFill = node.type !== "frame" && (
    Array.isArray(node.fills)
      ? node.fills.some(f => f && f.type === "image")
      : !!(node.fill && node.fill.type === "image")
  );
  // Auto-layout frames get a distinct icon so they're recognizable at a glance.
  const LayerIcon = (node.type === "frame" && node.autoLayout) ? Icon.AutoLayout
                  : hasImageFill ? Icon.Image
                  : IconKind;

  const cls = [
    "layer",
    selected && "selected",
    isFrame && "is-frame",
    inSelectedSubtree && !selected && "in-sel-subtree",
    dragSource && "drag-source",
    dragIntent === "inside" && "drop-inside",
  ].filter(Boolean).join(" ");

  return (
    <div className={cls}
         draggable={!editing}
         style={{ opacity: node.hidden ? 0.5 : 1, paddingLeft: 4 + depth * 14 }}
         onClick={onSelect}
         onDoubleClick={() => setEditing(true)}
         onDragStart={onDragStart}
         onDragOver={onDragOver}
         onDragLeave={onDragLeave}
         onDrop={onDrop}
         onDragEnd={onDragEnd}>
      {/* Drop indicator lines */}
      {dragIntent === "before" && <div className="drop-line drop-line-top" />}
      {dragIntent === "after"  && <div className="drop-line drop-line-bot" />}
      {hasKids ? (
        <span className="caret" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              style={{ cursor: "pointer", transform: collapsed ? "none" : "rotate(90deg)" }}>
          <Icon.ChevronR size={10} />
        </span>
      ) : (
        <span className="caret hidden"><Icon.ChevronR size={10} /></span>
      )}
      <span className="layer-icon"><LayerIcon size={14} /></span>
      {editing ? (
        <input autoFocus value={value}
               onChange={e => setValue(e.target.value)}
               onBlur={() => { onRename(value); setEditing(false); }}
               onKeyDown={e => { if (e.key === "Enter") { onRename(value); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
               style={{ flex: 1, border: "none", outline: "1px solid var(--accent)", borderRadius: 3, background: "var(--app-panel)", fontSize: 12, color: "var(--app-fg)", padding: "0 3px", height: 20 }}/>
      ) : (
        <span className="layer-name" style={isFrame ? { fontWeight: 600 } : null}>{node.name}</span>
      )}
      <div className="layer-actions">
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}>
          {node.hidden ? <Icon.EyeOff size={14} /> : <Icon.Eye size={14} />}
        </button>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onToggleLock(); }}>
          {node.locked ? <Icon.Lock size={14} /> : <Icon.Unlock size={14} />}
        </button>
      </div>
    </div>
  );
}

export { LeftPanel };
