import React from "react";
import { Icon } from "./icons.jsx";
import {
  useApp, SHAPE_DEFAULTS, uid, clamp, round, hexToRgba, lineHeightCss, penBounds,
} from "./utils.jsx";
import { renderShape, Rulers } from "./shapes.jsx";
/* global React, Icon, useApp, SHAPE_DEFAULTS, uid, clamp, round, renderShape, Rulers, hexToRgba */
const { useState, useRef, useEffect, useCallback } = React;

// Compute a unique auto-name for a new node: the first of a type keeps the
// bare base label ("Frame"), later ones become "Frame 1", "Frame 2", …
// filling any gaps left by deletions. Shared by addNode and wrapInFrame so
// every creation path numbers consistently.
function nextAutoName(base, type, siblings) {
  const sameType = siblings.filter(c => c.type === type);
  if (sameType.length === 0) return base;
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)$`);
  const used = new Set(sameType.map(c => { const m = c.name?.match(re); return m ? +m[1] : null; }).filter(Boolean));
  let k = 1; while (used.has(k)) k++;
  return `${base} ${k}`;
}

// Strip a trailing " N" to recover the base label of an auto-named node, so a
// duplicate of "Frame 2" renumbers from "Frame" rather than cloning the name.
function autoNameBase(name, type) {
  const base = (name || "").replace(/\s+\d+$/, "").trim();
  return base || SHAPE_DEFAULTS[type]?.name || type;
}

// Frame label rendered in screen-space in the canvas chrome layer.
// Lives OUTSIDE the scaled canvas-world so it's never clipped by a parent
// frame's overflow:hidden and stays crisp at any zoom.
// - Single-click → select the frame
// - Double-click → inline-rename
function FrameLabel({ node, isSelected, screenX, screenY, screenW, onSelect, onRename }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);
  useEffect(() => { setValue(node.name); }, [node.name]);
  const commit = () => {
    if (value.trim()) onRename(value.trim());
    setEditing(false);
  };
  const commonStyle = {
    position: "absolute",
    left: screenX,
    top: screenY - 18,
    maxWidth: Math.max(60, screenW),
    pointerEvents: "auto",
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setValue(node.name); setEditing(false); }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...commonStyle,
          fontSize: "11px",
          padding: "1px 4px",
          background: "var(--app-panel)",
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          borderRadius: "3px",
          outline: "none",
          fontFamily: "inherit",
          fontWeight: 500,
          zIndex: 10,
          minWidth: "80px",
        }}
      />
    );
  }
  return (
    <div
      className={`frame-label ${isSelected ? "selected" : ""}`}
      style={{ ...commonStyle, cursor: "pointer", userSelect: "none", overflow: "hidden", textOverflow: "ellipsis" }}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title={node.name}
    >
      {node.name}
    </div>
  );
}

// Snap threshold in screen pixels
const SNAP_PX = 6;

function Canvas() {
  const {
    doc, setDoc, activePageId, selection, setSelection, selCtx, setSelCtx,
    tool, setTool, history, rulers, canvasBg,
    pan, setPan, zoom, setZoom,
  } = useApp();
  const canvasRef = useRef(null);
  const cursorWorldRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [editingText, setEditingText] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [snaps, setSnaps] = useState([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Drop indicator while reordering a child inside an auto-layout frame:
  // { parentId, index, isRow, x, y, len } in world coords (null = inactive).
  const [reorderHint, setReorderHint] = useState(null);
  // Z held = zoom tool active (spring-loaded, like spacebar for pan). When released,
  // we restore whatever tool was active before — stashed in this ref.
  const zHeldRef = useRef(false);
  const prevToolRef = useRef(null);
  // Whether a zoom-marquee drag is currently in flight. If Z is released
  // DURING the drag, we delay restoring the previous tool until the drag's
  // up-handler runs — otherwise the tool flips back mid-drag and the
  // in-flight handlers and the UI desync.
  const zoomDragRef = useRef(false);
  // Track the canvas area's visible size so the rulers re-render when it
  // resizes (and so they actually have a non-zero width on first paint —
  // canvasRef.current is null during the first render pass).
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const page = doc.pages.find(p => p.id === activePageId);
  const children = page?.children || [];
  const guides = page?.guides || [];

  // ----- Resolved layout geometry (Auto Layout engine) -----
  // Single source of truth for the WORLD-space x/y/w/h of every node after
  // hug/fill/nesting are resolved. Computed once per render (the engine
  // memoizes by the children-array reference, so this is a cheap shared
  // pass), then read by rendering, hit-testing, selection chrome, snapping
  // and the resize/move handlers. For nodes outside any auto-layout subtree
  // it equals their stored coords.
  const geom = window.LayoutEngine.resolve(children).geom;
  // Geometry box for a node (falls back to stored coords if not yet laid out).
  const G = useCallback((n) => (n && geom.get(n.id)) || (n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null), [geom]);
  const GP = useCallback((id) => geom.get(id) || null, [geom]);
  // Always-fresh handles to the latest children for drag handlers, which
  // close over a stale `children` once the drag's first setDoc lands.
  const childrenRef = useRef(children);
  childrenRef.current = children;
  // In-flight guide preview while the user is dragging from a ruler or moving
  // an existing guide. Shape: { kind: "h"|"v", at: worldCoord, draggingIdx?: number }
  const [previewGuide, setPreviewGuide] = useState(null);

  // Deepest frame that contains a world-space point.
  // Excludes ids in `excludeIds` (used when dropping — a shape can't re-parent into itself/descendants).
  const deepestFrameAt = (x, y, excludeIds = []) => {
    const exc = new Set(excludeIds);
    const hits = children.filter(c => {
      if (c.type !== "frame" || c.hidden || c.locked || exc.has(c.id)) return false;
      const b = G(c);
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    });
    const depth = (n) => { let d = 0, p = n.parentId; while (p) { d++; p = children.find(c => c.id === p)?.parentId; } return d; };
    return hits.sort((a, b) => depth(b) - depth(a))[0];
  };

  // Update child in current page
  const updateNode = useCallback((id, patch) => {
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => p.id === activePageId
        ? { ...p, children: p.children.map(c => c.id === id ? { ...c, ...patch } : c) }
        : p)
    }));
  }, [setDoc, activePageId]);

  const addNode = useCallback((n) => {
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        let node = n;
        // Auto-numbering: a node tagged with `_autoName` (the base label, e.g.
        // "Rectangle") gets a unique name computed against the LIVE page
        // children here in the updater — not from a stale render closure.
        // First of a type keeps the bare label; the rest become
        // "Rectangle 1", "Rectangle 2", … filling any gaps left by deletions.
        if (n._autoName) {
          const name = nextAutoName(n._autoName, n.type, p.children);
          const { _autoName, ...rest } = n;
          node = { ...rest, name };
        }
        return { ...p, children: [...p.children, node] };
      })
    }));
  }, [setDoc, activePageId]);

  const deleteNodes = useCallback((ids) => {
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        // Deleting a frame must also delete everything nested inside it —
        // otherwise its children survive as orphans (parentId points at a
        // node that no longer exists), keep rendering, and select with
        // mispositioned chrome. Expand the kill set to the full subtree.
        const kill = new Set(ids);
        let grew = true;
        while (grew) {
          grew = false;
          for (const c of p.children) {
            if (c.parentId && kill.has(c.parentId) && !kill.has(c.id)) {
              kill.add(c.id); grew = true;
            }
          }
        }
        return { ...p, children: p.children.filter(c => !kill.has(c.id)) };
      })
    }));
  }, [setDoc, activePageId]);

  // Z-order (stacking) — reorder selected nodes among their siblings. Array
  // order IS z-order (last sibling = frontmost), so we only permute the
  // sibling slots and leave every other node in place.
  //   mode: "front" | "back" | "forward" | "backward"
  const reorderZ = useCallback((mode) => {
    if (!selection.length) return;
    const selSet = new Set(selection);
    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        const arr = p.children.slice();
        const byId = Object.fromEntries(arr.map(c => [c.id, c]));
        const moveOne = (id) => {
          const node = byId[id];
          if (!node) return;
          const pid = node.parentId || null;
          const sibs = arr.filter(c => (c.parentId || null) === pid).map(c => c.id);
          const si = sibs.indexOf(id);
          let nsi = si;
          if (mode === "front") nsi = sibs.length - 1;
          else if (mode === "back") nsi = 0;
          else if (mode === "forward") nsi = Math.min(sibs.length - 1, si + 1);
          else if (mode === "backward") nsi = Math.max(0, si - 1);
          if (nsi === si) return;
          sibs.splice(si, 1);
          sibs.splice(nsi, 0, id);
          // Write the sibling nodes back into the same array slots, new order.
          const slots = [];
          arr.forEach((c, i) => { if ((c.parentId || null) === pid) slots.push(i); });
          sibs.forEach((sid, k) => { arr[slots[k]] = byId[sid]; });
        };
        // Process order avoids selected nodes clobbering each other's slots.
        const ids = arr.filter(c => selSet.has(c.id)).map(c => c.id);
        const order = (mode === "back" || mode === "forward") ? ids.slice().reverse() : ids;
        order.forEach(moveOne);
        return { ...p, children: arr };
      })
    }));
    history.commit();
  }, [selection, activePageId, history, setDoc]);

  // ============================================================
  // Ruler guides — drag from a ruler to drop a guide line;
  // drag a guide back to its ruler to delete it.
  // ============================================================
  const RULER_W = 24;

  // True if the cursor is over the ruler corresponding to a guide of `kind`
  // ("h" guide lives in the TOP ruler; "v" guide in the LEFT ruler).
  const overOriginRuler = (kind, ev) => {
    if (!rulers) return false;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return false;
    if (kind === "h") return ev.clientY < rect.top + RULER_W;
    return ev.clientX < rect.left + RULER_W;
  };

  // Mousedown on a ruler — drag-create a guide.
  const onGuideStart = (kind, e) => {
    e.preventDefault();
    e.stopPropagation();
    const w = screenToWorld(e.clientX, e.clientY);
    const startAt = kind === "h" ? w.y : w.x;
    setPreviewGuide({ kind, at: startAt });
    const move = (ev) => {
      const w2 = screenToWorld(ev.clientX, ev.clientY);
      setPreviewGuide({ kind, at: kind === "h" ? w2.y : w2.x });
    };
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPreviewGuide(null);
      // If released back over the originating ruler → no-op (don't create).
      if (overOriginRuler(kind, ev)) return;
      const w2 = screenToWorld(ev.clientX, ev.clientY);
      const finalAt = Math.round(kind === "h" ? w2.y : w2.x);
      history.snapshot();
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => p.id === activePageId
          ? { ...p, guides: [...(p.guides || []), { kind, at: finalAt }] }
          : p)
      }));
      history.commit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Mousedown on an existing guide — reposition (or delete by dragging onto ruler).
  const onGuideDrag = (idx, e) => {
    e.preventDefault();
    e.stopPropagation();
    const g = guides[idx];
    if (!g) return;
    history.snapshot();
    setPreviewGuide({ kind: g.kind, at: g.at, draggingIdx: idx });
    const move = (ev) => {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const at = Math.round(g.kind === "h" ? w.y : w.x);
      setPreviewGuide({ kind: g.kind, at, draggingIdx: idx });
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => p.id === activePageId
          ? { ...p, guides: (p.guides || []).map((x, i) => i === idx ? { ...x, at } : x) }
          : p)
      }));
    };
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPreviewGuide(null);
      // Dragged back onto its ruler → delete.
      if (overOriginRuler(g.kind, ev)) {
        setDoc(d => ({
          ...d,
          pages: d.pages.map(p => p.id === activePageId
            ? { ...p, guides: (p.guides || []).filter((_, i) => i !== idx) }
            : p)
        }));
      }
      history.commit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Live text updates during editing (bypasses history for smooth typing)
  useEffect(() => {
    window.__textLiveUpdate = (id, patch) => {
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => {
          if (p.id !== activePageId) return p;
          // Apply the text patch.
          let kids = p.children.map(c => c.id === id ? { ...c, ...patch } : c);
          // Frame containment policy:
          // - We DO NOT grow the parent frame to fit text. The user picked
          //   that frame size; pasting long text should never silently
          //   stretch a 600×300 frame to 5000px wide.
          // - If the text node is in `auto-wh` mode (single-line, no wrap)
          //   and would overflow the parent frame horizontally, promote it
          //   to `auto-h` with width = remaining frame width. The text then
          //   wraps inside the frame instead of bursting out of it. Height
          //   reflows naturally via the textarea's scrollHeight on next input.
          const txt = kids.find(c => c.id === id);
          if (txt && txt.type === "text" && txt.parentId) {
            const parent = kids.find(c => c.id === txt.parentId);
            if (parent && parent.type === "frame") {
              const tx = txt.x - parent.x;
              const availW = parent.w - tx;
              const overflows = (txt.sizingMode || "auto-h") === "auto-wh" && txt.w > availW && availW > 20;
              if (overflows) {
                kids = kids.map(c => c.id === id
                  ? { ...c, sizingMode: "auto-h", w: availW }
                  : c);
              }
            }
          }
          return { ...p, children: kids };
        })
      }));
    };
    return () => { delete window.__textLiveUpdate; };
  }, [activePageId, setDoc]);

  // Screen <-> world transforms
  const screenToWorld = useCallback((sx, sy) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (sx - rect.left - pan.x) / zoom, y: (sy - rect.top - pan.y) / zoom };
  }, [pan, zoom]);

  // Wheel: pan + ctrl/cmd zoom
  const onWheel = (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = -e.deltaY * 0.005;
      const newZoom = clamp(zoom * (1 + delta), 0.05, 256);
      const worldX = (mx - pan.x) / zoom;
      const worldY = (my - pan.y) / zoom;
      setPan({ x: mx - worldX * newZoom, y: my - worldY * newZoom });
      setZoom(newZoom);
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // Keyboard — space pan, delete, shortcuts
  useEffect(() => {
    const down = (e) => {
      const target = e.target;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === " " && !spaceHeld) { setSpaceHeld(true); e.preventDefault(); return; }
      // Z held = spring-loaded zoom tool. Stash the current tool so we can
      // restore it on keyup. Ignore auto-repeat keydowns.
      if ((e.key === "z" || e.key === "Z") && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.repeat) {
        if (!zHeldRef.current) {
          zHeldRef.current = true;
          prevToolRef.current = tool;
          setTool("zoom");
        }
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        if (editingText) { setEditingText(null); return; }
        // Figma: Esc selects the parent of the current selection. If selection is empty
        // or already at root, step the selection-context UP one level.
        if (selection.length === 1) {
          const cur = children.find(c => c.id === selection[0]);
          if (cur?.parentId) {
            // Select the parent and set ctx to grandparent.
            const parent = children.find(c => c.id === cur.parentId);
            setSelection([cur.parentId]);
            setSelCtx(parent?.parentId || null);
            return;
          }
        }
        if (selCtx) {
          const ctxNode = children.find(c => c.id === selCtx);
          setSelCtx(ctxNode?.parentId || null);
          setSelection([]);
          return;
        }
        setSelection([]); setTool("select");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection.length) {
        history.snapshot(); deleteNodes(selection); history.commit(); setSelection([]); e.preventDefault(); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); history.redo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        setSelection(children.map(c => c.id));
        return;
      }
      // Shift+A — wrap selection in an auto-layout frame (Figma shortcut).
      if (e.shiftKey && (e.key === "A" || e.key === "a") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (selection.length) { e.preventDefault(); autoLayoutFromSelection(); return; }
      }
      // Cmd/Ctrl+Alt+G — Frame selection (wrap in a plain frame). Cmd+Alt+G in
      // Figma. Guard before the plain Cmd+A / tool shortcuts.
      if ((e.metaKey || e.ctrlKey) && e.altKey && (e.key === "g" || e.key === "G") && selection.length) {
        e.preventDefault();
        frameSelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selection.length) {
        e.preventDefault();
        history.snapshot();
        // Collect selected + descendants so duplicating a frame clones its children.
        const all = new Set(selection);
        let added = true;
        while (added) {
          added = false;
          children.forEach(c => { if (c.parentId && all.has(c.parentId) && !all.has(c.id)) { all.add(c.id); added = true; } });
        }
        const subtree = children.filter(c => all.has(c.id));
        const idMap = {};
        subtree.forEach(c => { idMap[c.id] = uid(); });
        const origIds = new Set(subtree.map(c => c.id));
        const clones = subtree.map(c => {
          const isTop = !c.parentId || !origIds.has(c.parentId);
          return {
            ...c,
            id: idMap[c.id],
            // Only offset top-level clones; descendants keep their relative position (parent moves them).
            x: c.parentId && origIds.has(c.parentId) ? c.x : c.x + 20,
            y: c.parentId && origIds.has(c.parentId) ? c.y : c.y + 20,
            parentId: c.parentId && origIds.has(c.parentId) ? idMap[c.parentId] : (c.parentId || null),
            // Top-level clones renumber (Frame → Frame 3); nested keep their names.
            ...(isTop ? { _autoName: autoNameBase(c.name, c.type) } : {}),
          };
        });
        clones.forEach(addNode);
        setSelection(subtree.filter(c => !c.parentId || !origIds.has(c.parentId)).map(c => idMap[c.id]));
        history.commit();
        return;
      }
      // Copy / Cut — stash selected subtree into window.__designerClipboard
      if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "x") && selection.length) {
        e.preventDefault();
        // Collect selected + all descendants, preserving parent relationships.
        const all = new Set(selection);
        let added = true;
        while (added) {
          added = false;
          children.forEach(c => { if (c.parentId && all.has(c.parentId) && !all.has(c.id)) { all.add(c.id); added = true; } });
        }
        const payload = children.filter(c => all.has(c.id)).map(c => ({ ...c }));
        window.__designerClipboard = payload;
        if (e.key === "x") { history.snapshot(); deleteNodes(selection); history.commit(); setSelection([]); }
        return;
      }
      // Paste — into (a) selected frame if one is selected, (b) deepest frame under cursor, (c) root.
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && window.__designerClipboard?.length) {
        e.preventDefault();
        const clip = window.__designerClipboard;
        // Target parent: priority is selected frame > frame under last cursor > root
        let targetParent = null;
        let dropX = null, dropY = null;
        const selFrame = selection.length === 1 && children.find(c => c.id === selection[0] && c.type === "frame");
        if (selFrame) {
          targetParent = selFrame.id;
          dropX = selFrame.x + 20; dropY = selFrame.y + 20;
        } else if (cursorWorldRef.current) {
          const pt = cursorWorldRef.current;
          const f = deepestFrameAt(pt.x, pt.y);
          targetParent = f?.id || null;
          dropX = pt.x; dropY = pt.y;
        }
        // Compute offset: move the paste so its bounding-box top-left aligns to drop point.
        const topLevel = clip.filter(c => !clip.some(k => k.id === c.parentId));
        const minX = Math.min(...topLevel.map(c => c.x));
        const minY = Math.min(...topLevel.map(c => c.y));
        const ox = dropX != null ? dropX - minX : 20;
        const oy = dropY != null ? dropY - minY : 20;
        // Re-id everything + rewrite parentId references.
        // Re-id everything + rewrite parentId references.
        const idMap = {};
        clip.forEach(c => { idMap[c.id] = uid(); });
        const origIds2 = new Set(clip.map(c => c.id));
        const fresh = clip.map(c => {
          const isTop = !c.parentId || !origIds2.has(c.parentId);
          return {
            ...c,
            id: idMap[c.id],
            x: c.x + ox,
            y: c.y + oy,
            // If this node's original parent is also in the clipboard, map to new id.
            // Otherwise, re-parent to the drop target (frame under cursor / selected frame / root).
            parentId: c.parentId && origIds2.has(c.parentId) ? idMap[c.parentId] : targetParent,
            // Top-level pasted nodes renumber against the destination.
            ...(isTop ? { _autoName: autoNameBase(c.name, c.type) } : {}),
          };
        });
        history.snapshot();
        fresh.forEach(addNode);
        // Select only the top-level pasted nodes (those whose original parent wasn't in the clipboard).
        const origIds = new Set(clip.map(c => c.id));
        const topLevelNewIds = clip
          .filter(c => !c.parentId || !origIds.has(c.parentId))
          .map(c => idMap[c.id]);
        setSelection(topLevelNewIds);
        history.commit();
        return;
      }
      // Z-order shortcuts (Figma): ] front, [ back, Cmd/Ctrl+] forward,
      // Cmd/Ctrl+[ backward. Requires a selection.
      if ((e.key === "]" || e.key === "[") && selection.length) {
        e.preventDefault();
        const mod = e.metaKey || e.ctrlKey;
        if (e.key === "]") reorderZ(mod ? "forward" : "front");
        else reorderZ(mod ? "backward" : "back");
        return;
      }
      // Tool shortcuts (single-letter, no modifiers). Z is handled above as a
      // hold-to-zoom modifier, so it's intentionally not in this map.
      const keyMap = { v: "select", h: "hand", f: "frame", r: "rect", o: "ellipse", l: "line",
                       p: "pen", t: "text", c: "comment", i: "image" };
      if (keyMap[e.key?.toLowerCase()] && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        setTool(keyMap[e.key.toLowerCase()]);
      }

      // Cmd/Ctrl+0 — zoom to 100% (anchored on viewport center).
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        const vp = canvasRef.current?.getBoundingClientRect();
        if (!vp) return;
        const cx = vp.width / 2, cy = vp.height / 2;
        // World point currently under the viewport center
        const wx = (cx - pan.x) / zoom;
        const wy = (cy - pan.y) / zoom;
        const newZoom = 1;
        setZoom(newZoom);
        setPan({ x: cx - wx * newZoom, y: cy - wy * newZoom });
      }

      // Shift+2 — zoom-to-selection (Figma: fit selected frame to viewport).
      // Use e.code so it works regardless of keyboard layout (`e.key === "@"`
      // is US-layout-specific).
      if (e.shiftKey && e.code === "Digit2" && !e.metaKey && !e.ctrlKey && selection.length) {
        e.preventDefault();
        // Union bbox of selected nodes (world coords)
        const sel = children.filter(c => selection.includes(c.id));
        if (!sel.length) return;
        const x1 = Math.min(...sel.map(s => s.x));
        const y1 = Math.min(...sel.map(s => s.y));
        const x2 = Math.max(...sel.map(s => s.x + s.w));
        const y2 = Math.max(...sel.map(s => s.y + s.h));
        const bw = x2 - x1, bh = y2 - y1;
        if (bw <= 0 || bh <= 0) return;

        const vp = canvasRef.current?.getBoundingClientRect();
        if (!vp) return;
        const rulerOff = rulers ? 24 : 0;
        const vw = vp.width  - rulerOff;
        const vh = vp.height - rulerOff;
        const PAD = 0.92; // leave a little breathing room
        const newZoom = clamp(Math.min(vw / bw, vh / bh) * PAD, 0.05, 256);
        // Center the bbox in the viewport (account for ruler gutter)
        setZoom(newZoom);
        setPan({
          x: rulerOff + vw / 2 - (x1 + bw / 2) * newZoom,
          y: rulerOff + vh / 2 - (y1 + bh / 2) * newZoom,
        });
      }
      // Arrow nudge
      if (selection.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        // Auto Layout: a single in-flow child REORDERS within its frame
        // instead of nudging x/y (which the layout would ignore). Arrows along
        // the flow axis move it earlier/later; perpendicular arrows are no-ops.
        if (selection.length === 1) {
          const node = children.find(c => c.id === selection[0]);
          const parent = node && node.parentId ? children.find(c => c.id === node.parentId) : null;
          const sz = window.LayoutEngine.sizing;
          if (node && parent && sz.isAL(parent) && !sz.isAbsolute(node)) {
            const isRow = parent.direction !== "column";
            let delta = 0;
            if (isRow) delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
            else delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
            if (delta !== 0) {
              const sibs = children.filter(c => (c.parentId || null) === parent.id && !sz.isAbsolute(c) && !c.hidden);
              const i = sibs.findIndex(s => s.id === node.id);
              const j = clamp(i + delta, 0, sibs.length - 1);
              if (j !== i) { history.snapshot(); applyReorder(parent.id, node.id, j, sibs); history.commit(); }
            }
            return; // consume — never nudge an auto-layout child's coords
          }
        }
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        // Coalesce rapid arrow presses into ONE undo entry — start a 500ms
        // transient session keyed off the selection. Each subsequent arrow
        // press inside the window resets the timer without re-snapshotting.
        history.beginTransient("nudge:" + selection.join(","));
        // Move the selected nodes AND all descendants — children of a frame
        // are stored in world coords, so a frame must carry its subtree.
        const moveSet = new Set(selection);
        let grew = true;
        while (grew) {
          grew = false;
          children.forEach(c => {
            if (c.parentId && moveSet.has(c.parentId) && !moveSet.has(c.id)) { moveSet.add(c.id); grew = true; }
          });
        }
        moveSet.forEach(id => {
          const n = children.find(c => c.id === id);
          if (n) updateNode(id, { x: n.x + dx, y: n.y + dy });
        });
      }
    };
    const up = (e) => {
      if (e.key === " ") setSpaceHeld(false);
      if (e.key === "z" || e.key === "Z") {
        if (zHeldRef.current) {
          zHeldRef.current = false;
          // If a zoom-marquee drag is still in flight, defer the tool
          // restore — the drag's up-handler will do it once the user
          // releases the mouse. Otherwise restore immediately.
          if (zoomDragRef.current) return;
          setTool(prevToolRef.current || "select");
          prevToolRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [selection, children, spaceHeld, history, tool, reorderZ]);

  // Paste an image straight from the OS clipboard (Cmd/Ctrl+V of a copied
  // image, screenshot, etc.) → drops a real image node at the cursor.
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const imgItem = [...items].find(it => it.type && it.type.startsWith("image/"));
      if (!imgItem) return; // no image on the clipboard → let other paste paths run
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result;
        const img = new Image();
        img.onload = () => {
          // Cap the placed size so huge screenshots don't flood the canvas,
          // preserving aspect ratio.
          const MAX = 800;
          let w = img.naturalWidth || SHAPE_DEFAULTS.image.w;
          let h = img.naturalHeight || SHAPE_DEFAULTS.image.h;
          const scale = Math.min(1, MAX / w, MAX / h);
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));

          // Drop point: last cursor world position → viewport center → origin.
          let cx, cy, parent = null;
          if (cursorWorldRef.current) {
            cx = cursorWorldRef.current.x; cy = cursorWorldRef.current.y;
            parent = deepestFrameAt(cx, cy)?.id || null;
          } else {
            const vp = canvasRef.current && canvasRef.current.getBoundingClientRect();
            cx = vp ? (vp.width / 2 - pan.x) / zoom : 0;
            cy = vp ? (vp.height / 2 - pan.y) / zoom : 0;
          }

          const node = {
            ...SHAPE_DEFAULTS.image,
            id: uid(),
            type: "image",
            parentId: parent,
            x: Math.round(cx - w / 2),
            y: Math.round(cy - h / 2),
            w, h,
            src,
            _autoName: "Image",
          };
          history.snapshot();
          addNode(node);
          setSelection([node.id]);
          history.commit();
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pan, zoom, history, addNode]);

  // ---------- Pen-tool helpers ----------
  // Patch a single point on an in-progress vector (used to pull Bézier
  // handles while the mouse is held after placing an anchor).
  function patchPenPoint(nodeId, idx, patch) {
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => p.id !== activePageId ? p : {
        ...p,
        children: p.children.map(c => c.id !== nodeId ? c : {
          ...c,
          points: c.points.map((pt, i) => i === idx ? { ...pt, ...patch } : pt),
        }),
      }),
    }));
  }

  // Finalize a vector: normalize points into a tight bbox (handles included)
  // and set closed/open. A path with <2 points is discarded.
  function finalizePen(id, closed) {
    const n = children.find(c => c.id === id);
    if (!n || n.type !== "pen") return;
    if ((n.points?.length || 0) < 2) { deleteNodes([id]); return; }
    const b = penBounds(n.points);
    updateNode(id, {
      x: n.x + b.minX, y: n.y + b.minY,
      w: Math.max(1, b.maxX - b.minX), h: Math.max(1, b.maxY - b.minY),
      points: n.points.map(p => ({ ...p, x: p.x - b.minX, y: p.y - b.minY })),
      closed,
    });
  }

  // ---------- Mouse interactions on canvas ----------
  const onMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && (tool === "hand" || spaceHeld))) {
      // Pan
      const start = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      const move = (ev) => setPan({ x: start.px + (ev.clientX - start.x), y: start.py + (ev.clientY - start.y) });
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      return;
    }

    const w = screenToWorld(e.clientX, e.clientY);
    const hitId = hitTest(children, w.x, w.y);

    // Zoom tool: click → 2× zoom anchored on click, Alt-click → 0.5×,
    // drag → zoom-to-rect (fit dragged area into the viewport). Returns to
    // select tool after the action so it behaves like a one-shot.
    if (tool === "zoom") {
      const vpEl = canvasRef.current;
      const vp = vpEl?.getBoundingClientRect();
      if (!vp) return;
      const rulerOff = rulers ? 24 : 0;
      const startScreen = { x: e.clientX - vp.left, y: e.clientY - vp.top };
      const startWorld = w;
      const zoomOut = e.altKey;
      let dragged = false;
      zoomDragRef.current = true;
      setDrag({ kind: "zoom-marquee", x: w.x, y: w.y, w: 0, h: 0 });
      const move = (ev) => {
        if (Math.abs(ev.clientX - e.clientX) > 3 || Math.abs(ev.clientY - e.clientY) > 3) dragged = true;
        const cur = screenToWorld(ev.clientX, ev.clientY);
        const x = Math.min(startWorld.x, cur.x), y = Math.min(startWorld.y, cur.y);
        const ww = Math.abs(cur.x - startWorld.x), hh = Math.abs(cur.y - startWorld.y);
        setDrag({ kind: "zoom-marquee", x, y, w: ww, h: hh });
      };
      const up = (ev) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        setDrag(null);
        const vw = vp.width - rulerOff;
        const vh = vp.height - rulerOff;
        if (dragged) {
          const cur = screenToWorld(ev.clientX, ev.clientY);
          const x = Math.min(startWorld.x, cur.x), y = Math.min(startWorld.y, cur.y);
          const ww = Math.abs(cur.x - startWorld.x), hh = Math.abs(cur.y - startWorld.y);
          if (ww > 2 && hh > 2) {
            const newZoom = clamp(Math.min(vw / ww, vh / hh), 0.05, 256);
            setZoom(newZoom);
            setPan({
              x: rulerOff + vw / 2 - (x + ww / 2) * newZoom,
              y: rulerOff + vh / 2 - (y + hh / 2) * newZoom,
            });
          }
        } else {
          const factor = zoomOut ? 0.5 : 2;
          const newZoom = clamp(zoom * factor, 0.05, 256);
          setZoom(newZoom);
          setPan({
            x: startScreen.x - startWorld.x * newZoom,
            y: startScreen.y - startWorld.y * newZoom,
          });
        }
        // Stay in zoom mode while Z is still held; the keyup handler restores
        // the previous tool. If Z was already released (during the drag),
        // snap back NOW that the drag is over.
        zoomDragRef.current = false;
        if (!zHeldRef.current) {
          setTool(prevToolRef.current || "select");
          prevToolRef.current = null;
        }
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return;
    }

    if (tool === "select") {
      // FIGMA-STYLE SELECTION
      // ---------------------
      // The selection has a "context" (selCtx): the frame whose contents we're
      // editing. Initially null (page root). A click selects the topmost node
      // whose parent === selCtx and which contains the cursor.
      //
      // - Click outside selCtx (or any of its ancestors) → reset ctx to root.
      // - Click empty space inside selCtx → clear selection, keep ctx.
      // - Double-click a frame → step ctx INTO that frame, then re-pick.
      // - Esc → step ctx UP one level.
      const isAncestor = (ancestorId, nodeId) => {
        let p = children.find(c => c.id === nodeId)?.parentId;
        while (p) {
          if (p === ancestorId) return true;
          p = children.find(c => c.id === p)?.parentId;
        }
        return false;
      };

      // Collect every node containing the point, sorted topmost-first.
      const hits = [];
      for (let i = children.length - 1; i >= 0; i--) {
        const n = children[i];
        if (n.hidden || n.locked) continue;
        const b = G(n);
        let inside = false;
        if (n.type === "line") {
          const dx = b.w, dy = b.h;
          const len2 = dx * dx + dy * dy || 1;
          const t = clamp(((w.x - b.x) * dx + (w.y - b.y) * dy) / len2, 0, 1);
          const px = b.x + t * dx, py = b.y + t * dy;
          inside = Math.hypot(w.x - px, w.y - py) < Math.max(8, (n.stroke?.weight || 2));
        } else {
          inside = w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
        }
        if (inside) hits.push(n);
      }

      // Find target. Figma's actual rules:
      // - At root context (selCtx=null): pick the topmost NON-FRAME hit.
      //   Only select a frame if no non-frame child is under the cursor (i.e.
      //   user clicked empty frame space).
      // - Inside a context: pick the topmost direct child of the context.
      // - Cmd/Ctrl-click bypasses everything and picks the topmost hit.
      const deepSelect = e.metaKey || e.ctrlKey;
      let target;
      if (deepSelect) {
        target = hits.find(h => h.type !== "frame") || hits[0] || null;
      } else if (selCtx) {
        target = hits.find(h => (h.parentId || null) === selCtx) || null;
      } else {
        // Root context (Figma): a single click selects the OUTERMOST container
        // under the cursor. Clicking anywhere over a top-level frame — including
        // over its children — selects that frame, so a drag moves the WHOLE
        // frame (with its children), not the element inside it. To reach a
        // child, double-click the frame to enter it (sets selCtx); each further
        // double-click drills one level deeper.
        const topHit = hits[0] || null;
        if (topHit) {
          let node = topHit;
          while (node.parentId) {
            const parent = children.find(c => c.id === node.parentId);
            if (!parent) break;
            node = parent;
          }
          target = node;
        } else {
          target = null;
        }
      }

      // If nothing in current ctx was hit, but the user clicked outside the ctx
      // (e.g. on a sibling/ancestor of ctx), step ctx UP repeatedly until we find one.
      if (!target && selCtx) {
        let ctx = selCtx;
        while (ctx) {
          const ctxNode = children.find(c => c.id === ctx);
          ctx = ctxNode?.parentId || null;
          target = hits.find(h => (h.parentId || null) === ctx);
          if (target) { setSelCtx(ctx); break; }
        }
        if (!target) setSelCtx(null);
      }

      if (target) {
        // Deep-select also moves the context to match the picked target's parent.
        if (deepSelect) setSelCtx(target.parentId || null);
        // Marquee-from-empty-frame-space:
        // Only triggered when the user has ALREADY entered the frame's context
        // (selCtx === target.id). At root, clicking-and-dragging a frame moves
        // the frame — Figma's standard behavior.
        const isFrameEmptySpace = target.type === "frame" &&
          !hits.some(h => h !== target && h.parentId === target.id);
        const marqueeOnDrag = isFrameEmptySpace && selCtx === target.id;
        if (marqueeOnDrag && !e.shiftKey && !deepSelect) {
          const startX = e.clientX, startY = e.clientY;
          let started = false;
          const move = (ev) => {
            if (started) return;
            if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3) {
              started = true;
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
              // Start marquee scoped to this frame's direct children.
              setSelection([]);
              startMarqueeIn(e, target.id);
            }
          };
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            if (!started) {
              // No drag — just select the frame.
              setSelection([target.id]);
            }
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
          return;
        }
        if (e.shiftKey) {
          setSelection(selection.includes(target.id)
            ? selection.filter(id => id !== target.id)
            : [...selection, target.id]);
        } else if (!selection.includes(target.id)) {
          setSelection([target.id]);
        }
        startMove(e, selection.includes(target.id) && !e.shiftKey ? selection : [target.id]);
        return;
      }

      // Empty hit. If we're inside a context, treat empty space inside it as
      // "clear selection + start marquee scoped to ctx". If we're at root, same
      // but unscoped.
      if (!e.shiftKey) setSelection([]);
      startMarquee(e);
      return;
    }

    // Drawing tools — start creation drag
    if (["frame", "rect", "ellipse", "line", "polygon", "star", "text", "image", "comment"].includes(tool)) {
      const defaults = SHAPE_DEFAULTS[tool] || {};
      // Detect innermost frame at point (for nested-frame support)
      const frameAt = deepestFrameAt(w.x, w.y);
      const parentFrame = frameAt;
      const newNode = {
        id: uid(),
        type: tool,
        opacity: 1,
        ...defaults,
        // Auto-numbering is resolved in addNode against live page state.
        // `_autoName` carries the base label; addNode strips it and assigns
        // a unique "Base", "Base 1", "Base 2", … name.
        _autoName: defaults.name || tool,
        x: w.x, y: w.y,
        w: tool === "comment" ? 28 : 1, h: tool === "comment" ? 28 : 1,
        parentId: parentFrame?.id || null,
      };
      if (tool === "comment") {
        history.snapshot();
        addNode(newNode);
        history.commit();
        setSelection([newNode.id]);
        setTool("select");
        return;
      }
      if (tool === "text") {
        // Figma-style text tool:
        // - Click: create an AUTO-WIDTH text node at click point. Immediately editable.
        // - Drag: create a FIXED-WIDTH, AUTO-HEIGHT text box. Immediately editable.
        // sizingMode: "auto-wh" (hug both) | "auto-h" (fixed W, hug H) | "fixed" (both fixed)
        const textNode = {
          ...newNode,
          // start tiny; the textarea's scrollWidth/scrollHeight drives real size on blur
          w: 1, h: (defaults.fontSize || 16) * 1.2,
          text: "",
          sizingMode: "auto-wh",
        };
        let dragged = false;
        const startW = w;
        const move = (ev) => {
          const cur = screenToWorld(ev.clientX, ev.clientY);
          if (Math.abs(cur.x - startW.x) > 3 || Math.abs(cur.y - startW.y) > 3) {
            if (!dragged) {
              dragged = true;
              history.snapshot();
              addNode({ ...textNode, sizingMode: "auto-h" });
              setSelection([textNode.id]);
            }
            const x = Math.min(startW.x, cur.x);
            const y = Math.min(startW.y, cur.y);
            const width = Math.max(20, Math.abs(cur.x - startW.x));
            const height = Math.max(20, Math.abs(cur.y - startW.y));
            updateNode(textNode.id, { x, y, w: width, h: height, sizingMode: "auto-h" });
          }
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          if (!dragged) {
            // Simple click — create auto-width text
            history.snapshot();
            addNode(textNode);
            setSelection([textNode.id]);
          }
          history.commit();
          setEditingText(textNode.id);
          setTool("select");
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return;
      }
      history.snapshot();
      addNode(newNode);
      setSelection([newNode.id]);
      startCreate(e, newNode, w);
      return;
    }

    if (tool === "pen") {
      const startW = w;
      const existing = selection.length
        ? children.find(c => c.id === selection[0] && c.type === "pen" && !c.closed)
        : null;

      // Click on/near the FIRST anchor closes the path.
      if (existing && existing.points.length >= 2) {
        const first = existing.points[0];
        const fx = existing.x + first.x, fy = existing.y + first.y;
        if (Math.hypot((startW.x - fx) * zoom, (startW.y - fy) * zoom) < 9) {
          history.snapshot();
          finalizePen(existing.id, true);
          history.commit();
          setTool("select");
          return;
        }
      }

      history.snapshot();
      let penId, ptIdx;
      if (existing) {
        // Append a new corner anchor to the open path.
        penId = existing.id;
        ptIdx = existing.points.length;
        const local = { x: startW.x - existing.x, y: startW.y - existing.y };
        setDoc(d => ({
          ...d,
          pages: d.pages.map(p => p.id !== activePageId ? p : {
            ...p,
            children: p.children.map(c => c.id === penId ? { ...c, points: [...c.points, local] } : c),
          }),
        }));
      } else {
        // Start a new vector. SHAPE_DEFAULTS.pen is spread FIRST so the
        // explicit w:1/h:1/points below win (the defaults' 200×100 + empty
        // points would otherwise stomp the freshly-placed anchor).
        penId = uid();
        ptIdx = 0;
        const same = children.filter(c => c.type === "pen");
        const np = {
          ...SHAPE_DEFAULTS.pen,
          id: penId, type: "pen",
          name: same.length ? `Vector ${same.length + 1}` : "Vector",
          x: startW.x, y: startW.y, w: 1, h: 1, opacity: 1,
          points: [{ x: 0, y: 0 }],
          closed: false,
        };
        setSelection([penId]);
        setDoc(d => ({
          ...d,
          pages: d.pages.map(p => p.id !== activePageId ? p : { ...p, children: [...p.children, np] }),
        }));
      }

      // Holding + dragging after the click pulls SYMMETRIC Bézier handles on
      // the anchor just placed → a smooth curve point. A plain click (no
      // drag) leaves it a sharp corner.
      let dragged = false;
      const move = (ev) => {
        const cur = screenToWorld(ev.clientX, ev.clientY);
        const dx = cur.x - startW.x, dy = cur.y - startW.y;
        if (!dragged && Math.hypot(dx * zoom, dy * zoom) < 3) return;
        dragged = true;
        patchPenPoint(penId, ptIdx, { hOut: { x: dx, y: dy }, hIn: { x: -dx, y: -dy } });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        history.commit();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return;
    }
  };

  function startCreate(e, node, startW) {
    let dragged = false;
    let lastDims = { w: 1, h: 1 };
    const move = (ev) => {
      dragged = true;
      const w = screenToWorld(ev.clientX, ev.clientY);
      let x = Math.min(startW.x, w.x);
      let y = Math.min(startW.y, w.y);
      let width = Math.abs(w.x - startW.x);
      let height = Math.abs(w.y - startW.y);
      if (ev.shiftKey) {
        const s = Math.max(width, height);
        width = height = s;
      }
      if (node.type === "line") {
        let dx = w.x - startW.x;
        let dy = w.y - startW.y;
        // Hold Shift to constrain the line to 45° increments (horizontal,
        // vertical, and the two diagonals) — keeping the cursor's distance
        // along the snapped direction so the line still tracks the pointer.
        if (ev.shiftKey) {
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
            dx = Math.cos(snapped) * len;
            dy = Math.sin(snapped) * len;
          }
        }
        lastDims = { w: Math.round(dx), h: Math.round(dy) };
        updateNode(node.id, { x: Math.round(startW.x), y: Math.round(startW.y), w: lastDims.w, h: lastDims.h });
      } else {
        lastDims = { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
        updateNode(node.id, { x: Math.round(x), y: Math.round(y), w: lastDims.w, h: lastDims.h });
      }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setTool("select");
      // If it was just a click (no drag) OR tiny, give default size
      const tiny = !dragged || lastDims.w < 3 || lastDims.h < 3;
      if (node.type === "line") {
        // A pure click (no drag) would otherwise leave an invisible 1px line.
        // Drop a default-length horizontal line centered on the click instead.
        if (!dragged) {
          const defW = SHAPE_DEFAULTS.line?.w || 200;
          updateNode(node.id, { x: Math.round(startW.x - defW / 2), y: Math.round(startW.y), w: defW, h: 0 });
        }
      } else if (tiny) {
        // For frames specifically, a click should make a small 100×100 box —
        // not the full 1440×900 SHAPE_DEFAULTS canvas size. Other shapes keep
        // their declared defaults.
        const defW = node.type === "frame" ? 100 : (SHAPE_DEFAULTS[node.type]?.w || 100);
        const defH = node.type === "frame" ? 100 : (SHAPE_DEFAULTS[node.type]?.h || 100);
        // Center the default-sized shape on the click point (frames included).
        const x = startW.x - defW / 2;
        const y = startW.y - defH / 2;
        updateNode(node.id, { w: defW, h: defH, x, y });
      }
      history.commit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // ---------- Auto Layout: drag-to-reorder ----------
  // Reorder the children array so `draggedId` lands at flow-index `idx` among
  // the children of `parentId` (re-parenting if needed). Array order IS flow
  // order, so a single splice drives the live reflow.
  function applyReorder(parentId, draggedId, idx, flow) {
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        const dragged = p.children.find(c => c.id === draggedId);
        if (!dragged) return p;
        const sibIds = flow.map(f => f.id).filter(id => id !== draggedId);
        const beforeId = idx < sibIds.length ? sibIds[idx] : null;
        const ndragged = (dragged.parentId === parentId && !dragged.layoutPositioning)
          ? dragged
          : { ...dragged, parentId, layoutPositioning: undefined };
        let rest = p.children.filter(c => c.id !== draggedId);
        let insertAt;
        if (beforeId) {
          insertAt = rest.findIndex(c => c.id === beforeId);
          if (insertAt < 0) insertAt = rest.length;
        } else {
          const lastSib = sibIds[sibIds.length - 1];
          insertAt = lastSib ? rest.findIndex(c => c.id === lastSib) + 1 : rest.length;
        }
        rest = rest.slice(0, insertAt).concat([ndragged], rest.slice(insertAt));
        return { ...p, children: rest };
      })
    }));
  }

  // Drag a single in-flow auto-layout child. Within an AL frame this reorders
  // it live (slots reflow under the cursor); dragging it out drops it as a
  // free / absolute node at the cursor.
  function startReorder(e, node) {
    history.snapshot();
    const sz = window.LayoutEngine.sizing;
    const subtreeOf = (rootId) => {
      const cur = childrenRef.current;
      const ids = new Set([rootId]);
      let added = true;
      while (added) {
        added = false;
        cur.forEach(c => { if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); added = true; } });
      }
      return ids;
    };
    const move = (ev) => {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const cur = childrenRef.current;
      const g = window.LayoutEngine.resolve(cur).geom;
      const exclude = subtreeOf(node.id);
      // Deepest frame under the cursor that isn't part of the dragged subtree.
      const frames = cur.filter(c => c.type === "frame" && !c.hidden && !c.locked && !exclude.has(c.id));
      const within = frames.filter(f => {
        const b = g.get(f.id) || f;
        return w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
      });
      const depth = (n) => { let d = 0, q = n.parentId; while (q) { d++; q = cur.find(c => c.id === q)?.parentId; } return d; };
      const targetFrame = within.sort((a, b) => depth(b) - depth(a))[0] || null;

      if (targetFrame && targetFrame.autoLayout) {
        const isRow = targetFrame.direction !== "column";
        const flow = cur.filter(c => c.parentId === targetFrame.id && !exclude.has(c.id) && !sz.isAbsolute(c) && !c.hidden);
        const idx = window.LayoutEngine.insertionIndex(targetFrame, flow, g, w.x, w.y);
        applyReorder(targetFrame.id, node.id, idx, flow);
        // Insertion indicator.
        const fb = g.get(targetFrame.id) || targetFrame;
        const pad = sz.resolvePadding(targetFrame);
        let pos;
        if (flow.length === 0) pos = isRow ? fb.x + pad.l : fb.y + pad.t;
        else if (idx >= flow.length) { const last = g.get(flow[flow.length - 1].id); pos = isRow ? last.x + last.w : last.y + last.h; }
        else { const at = g.get(flow[idx].id); pos = isRow ? at.x : at.y; }
        setReorderHint({
          parentId: targetFrame.id, isRow,
          x: isRow ? pos : fb.x + pad.l,
          y: isRow ? fb.y + pad.t : pos,
          len: isRow ? (fb.h - pad.t - pad.b) : (fb.w - pad.l - pad.r),
        });
      } else {
        // Pulled out of auto layout → drop as a free node at the cursor.
        setReorderHint(null);
        const np = targetFrame ? targetFrame.id : null;
        const live = cur.find(c => c.id === node.id) || node;
        const b = g.get(node.id) || live;
        const targetX = Math.round(w.x - b.w / 2);
        const targetY = Math.round(w.y - b.h / 2);
        const dx = targetX - live.x, dy = targetY - live.y;
        const sub = subtreeOf(node.id);
        setDoc(d => ({
          ...d,
          pages: d.pages.map(p => p.id !== activePageId ? p : {
            ...p,
            children: p.children.map(c => {
              if (c.id === node.id) return { ...c, parentId: np, x: targetX, y: targetY, layoutPositioning: undefined };
              if (sub.has(c.id)) return { ...c, x: c.x + dx, y: c.y + dy };
              return c;
            }),
          }),
        }));
      }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setReorderHint(null);
      history.commit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function startMove(e, ids) {
    // Auto Layout: a single in-flow child drags as a reorder, not a free move.
    if (ids.length === 1 && !e.altKey) {
      const node = children.find(c => c.id === ids[0]);
      const parent = node && node.parentId ? children.find(c => c.id === node.parentId) : null;
      const sz = window.LayoutEngine.sizing;
      if (node && parent && sz.isAL(parent) && !sz.isAbsolute(node)) {
        startReorder(e, node);
        return;
      }
    }
    const startWorld = screenToWorld(e.clientX, e.clientY);
    // Expand selection to include all descendants (children move with parent frames)
    const collectDescendants = (parentIds) => {
      const all = new Set(parentIds);
      let added = true;
      while (added) {
        added = false;
        children.forEach(c => {
          if (c.parentId && all.has(c.parentId) && !all.has(c.id)) { all.add(c.id); added = true; }
        });
      }
      return [...all];
    };
    let movingIds = collectDescendants(ids);
    let originals = children.filter(c => movingIds.includes(c.id)).map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
    history.snapshot();

    // Alt/Option-drag = duplicate. Clone the moving subtree (including all
    // descendants so a frame brings its kids), then drag the clones instead
    // of the originals — Figma's standard behavior.
    if (e.altKey) {
      const subtree = children.filter(c => movingIds.includes(c.id));
      const idMap = {};
      subtree.forEach(c => { idMap[c.id] = uid(); });
      const origIds = new Set(subtree.map(c => c.id));
      const clones = subtree.map(c => ({
        ...c,
        id: idMap[c.id],
        // Re-parent inside the clone subtree; otherwise keep the original parent.
        parentId: c.parentId && origIds.has(c.parentId) ? idMap[c.parentId] : (c.parentId || null),
      }));
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => p.id === activePageId
          ? { ...p, children: [...p.children, ...clones] }
          : p)
      }));
      movingIds = clones.map(c => c.id);
      originals = clones.map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
      // Select the top-level clones (mirrors the original top-level selection).
      const topLevelCloneIds = subtree
        .filter(c => !c.parentId || !origIds.has(c.parentId))
        .map(c => idMap[c.id]);
      setSelection(topLevelCloneIds);
    }

    const others = children.filter(c => !movingIds.includes(c.id));

    const move = (ev) => {
      const w = screenToWorld(ev.clientX, ev.clientY);
      let dx = w.x - startWorld.x;
      let dy = w.y - startWorld.y;

      // Snapping
      const snapLines = [];
      if (originals.length === 1 && !ev.altKey) {
        const o = originals[0];
        const moved = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
        const edgesX = [moved.x, moved.x + moved.w / 2, moved.x + moved.w];
        const edgesY = [moved.y, moved.y + moved.h / 2, moved.y + moved.h];
        let bestX = null, bestY = null;
        others.forEach(o2 => {
          const tEx = [o2.x, o2.x + o2.w / 2, o2.x + o2.w];
          const tEy = [o2.y, o2.y + o2.h / 2, o2.y + o2.h];
          edgesX.forEach((v, i) => tEx.forEach(t => {
            const diff = t - v;
            if (Math.abs(diff) * zoom < SNAP_PX && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) {
              bestX = { diff, at: t };
            }
          }));
          edgesY.forEach((v, i) => tEy.forEach(t => {
            const diff = t - v;
            if (Math.abs(diff) * zoom < SNAP_PX && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) {
              bestY = { diff, at: t };
            }
          }));
        });
        if (bestX) { dx += bestX.diff; snapLines.push({ type: "v", at: bestX.at }); }
        if (bestY) { dy += bestY.diff; snapLines.push({ type: "h", at: bestY.at }); }
      }

      setSnaps(snapLines);
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => p.id === activePageId ? {
          ...p,
          children: p.children.map(c => {
            const o = originals.find(or => or.id === c.id);
            return o ? { ...c, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : c;
          })
        } : p)
      }));
    };
    const up = (ev) => {
      setSnaps([]);
      // Re-parent: for each top-level moved node (whose parent isn't also moving),
      // check what frame contains its new center and re-parent if it changed.
      const movingSet = new Set(movingIds);
      setDoc(d => ({
        ...d,
        pages: d.pages.map(p => {
          if (p.id !== activePageId) return p;
          const byId = Object.fromEntries(p.children.map(c => [c.id, c]));
          const topMoving = p.children.filter(c => movingSet.has(c.id) && !(c.parentId && movingSet.has(c.parentId)));
          const patched = { ...byId };
          topMoving.forEach(c => {
            // Re-parent target: pick the deepest frame that has the MOST
            // overlap with the dragged node's bbox (not just where the
            // node's center happens to land — that made re-parenting feel
            // random for large nodes near a frame edge).
            const exclude = [];
            const collectDesc = (id) => {
              exclude.push(id);
              p.children.forEach(k => { if (k.parentId === id) collectDesc(k.id); });
            };
            collectDesc(c.id);
            // Score every candidate frame by intersection area with `c`.
            // Tie-break by depth (deepest wins) — same as before.
            const candidates = p.children.filter(k =>
              k.type === "frame" && !k.hidden && !k.locked && !exclude.includes(k.id)
            );
            const dpth = (n) => { let d = 0, q = n.parentId; while (q) { d++; q = byId[q]?.parentId; } return d; };
            const overlap = (k) => {
              const ix = Math.max(0, Math.min(c.x + c.w, k.x + k.w) - Math.max(c.x, k.x));
              const iy = Math.max(0, Math.min(c.y + c.h, k.y + k.h) - Math.max(c.y, k.y));
              return ix * iy;
            };
            const area = Math.max(1, c.w * c.h);
            // Need at least ~25% of the moving node's area inside the
            // candidate frame to consider it. Below that, leave parent alone.
            const scored = candidates
              .map(k => ({ k, ov: overlap(k), d: dpth(k) }))
              .filter(s => s.ov / area >= 0.25);
            scored.sort((a, b) => (b.ov - a.ov) || (b.d - a.d));
            const newParent = scored[0]?.k.id || null;
            // If nothing qualifies, fall back to "is this node's CURRENT
            // parent still containing it?" — if yes, keep it; if no, drop to
            // root. Avoids pinning a node to a frame it no longer overlaps.
            const stillInOldParent = c.parentId
              ? (() => {
                  const old = byId[c.parentId];
                  return old && overlap(old) > 0;
                })()
              : false;
            const resolved = newParent || (stillInOldParent ? c.parentId : null);
            if (resolved !== (c.parentId || null)) {
              patched[c.id] = { ...patched[c.id], parentId: resolved };
            }
          });
          return { ...p, children: p.children.map(c => patched[c.id] || c) };
        })
      }));
      history.commit();
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // ---------- Shift+A: wrap selection in an auto-layout frame ----------
  // Figma-style. A single (non-AL) frame just gets auto layout enabled. Any
  // other selection is wrapped in a NEW auto-layout frame that hugs its
  // contents, inferring flow direction, order and gap from how the items are
  // arranged. Because the items nest into the new frame, this is also how you
  // build multiple / nested auto layouts.
  function autoLayoutFromSelection() {
    if (!selection.length) return;
    const sel = children.filter(c => selection.includes(c.id));
    if (!sel.length) return;

    // Single frame → enable auto layout in place.
    if (sel.length === 1 && sel[0].type === "frame") {
      if (!sel[0].autoLayout) { history.snapshot(); updateNode(sel[0].id, { autoLayout: true, direction: sel[0].direction || "column" }); history.commit(); }
      return;
    }

    // Only wrap the TOP-level selected nodes (skip any whose parent is also
    // selected — they travel with their parent).
    const selSet = new Set(selection);
    const top = sel.filter(c => !(c.parentId && selSet.has(c.parentId)));
    if (!top.length) return;
    const parents = new Set(top.map(c => c.parentId || null));
    const commonParent = parents.size === 1 ? [...parents][0] : null;

    // Union bbox (resolved/world coords).
    const boxes = top.map(c => G(c));
    const x1 = Math.min(...boxes.map(b => b.x));
    const y1 = Math.min(...boxes.map(b => b.y));
    const x2 = Math.max(...boxes.map(b => b.x + b.w));
    const y2 = Math.max(...boxes.map(b => b.y + b.h));

    // Infer direction: items spread wider horizontally → row, else column.
    const isRow = (x2 - x1) >= (y2 - y1);
    const ordered = top.slice().sort((a, b) => {
      const ba = G(a), bb = G(b);
      return isRow ? (ba.x - bb.x) : (ba.y - bb.y);
    });
    // Infer gap from the average spacing between adjacent items.
    const gaps = [];
    for (let i = 1; i < ordered.length; i++) {
      const prev = G(ordered[i - 1]), cur = G(ordered[i]);
      const g = isRow ? (cur.x - (prev.x + prev.w)) : (cur.y - (prev.y + prev.h));
      gaps.push(Math.max(0, Math.round(g)));
    }
    const gap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

    const frameId = uid();
    const frame = {
      id: frameId, type: "frame", name: "Frame",
      x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1),
      fill: null, fills: [],
      autoLayout: true, direction: isRow ? "row" : "column",
      gap, paddingX: 0, paddingY: 0,
      primaryAlign: "start", counterAlign: "start",
      layoutSizingH: "hug", layoutSizingV: "hug",
      clipContent: false, opacity: 1,
      parentId: commonParent,
    };

    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        const topIds = new Set(ordered.map(c => c.id));
        const rest = p.children.filter(c => !topIds.has(c.id));
        const firstOrigIdx = Math.min(...ordered.map(c => p.children.findIndex(x => x.id === c.id)));
        let insertPos = 0;
        p.children.forEach((c, idx) => { if (!topIds.has(c.id) && idx < firstOrigIdx) insertPos++; });
        const reparented = ordered.map(c => ({ ...c, parentId: frameId, layoutPositioning: undefined }));
        // Number the new frame against existing frames not being wrapped.
        const named = { ...frame, name: nextAutoName("Frame", "frame", rest) };
        const out = [...rest.slice(0, insertPos), named, ...reparented, ...rest.slice(insertPos)];
        return { ...p, children: out };
      })
    }));
    history.commit();
    setSelection([frameId]);
    setSelCtx(commonParent);
  }

  // Frame Selection (Figma: Cmd/Ctrl+Alt+G) — wrap the selected layers in a
  // PLAIN frame (no auto-layout, padding 0). Children keep their world
  // positions; the frame's box is their union bbox.
  function frameSelection() {
    if (!selection.length) return;
    const sel = children.filter(c => selection.includes(c.id));
    if (!sel.length) return;
    const selSet = new Set(selection);
    const top = sel.filter(c => !(c.parentId && selSet.has(c.parentId)));
    if (!top.length) return;
    const parents = new Set(top.map(c => c.parentId || null));
    const commonParent = parents.size === 1 ? [...parents][0] : null;

    const boxes = top.map(c => G(c));
    const x1 = Math.min(...boxes.map(b => b.x));
    const y1 = Math.min(...boxes.map(b => b.y));
    const x2 = Math.max(...boxes.map(b => b.x + b.w));
    const y2 = Math.max(...boxes.map(b => b.y + b.h));

    const frameId = uid();
    const frame = {
      id: frameId, type: "frame", name: "Frame",
      x: x1, y: y1, w: Math.max(1, Math.round(x2 - x1)), h: Math.max(1, Math.round(y2 - y1)),
      fill: null, fills: [], radius: 0, clipContent: false, opacity: 1,
      parentId: commonParent,
    };

    history.snapshot();
    setDoc(d => ({
      ...d,
      pages: d.pages.map(p => {
        if (p.id !== activePageId) return p;
        const topIds = new Set(top.map(c => c.id));
        const rest = p.children.filter(c => !topIds.has(c.id));
        const firstOrigIdx = Math.min(...top.map(c => p.children.findIndex(x => x.id === c.id)));
        let insertPos = 0;
        p.children.forEach((c, idx) => { if (!topIds.has(c.id) && idx < firstOrigIdx) insertPos++; });
        // Reparent WITHOUT changing world x/y — the renderer draws children at
        // (child.x - frame.x), so their on-screen position is preserved.
        const reparented = top.map(c => ({ ...c, parentId: frameId }));
        const named = { ...frame, name: nextAutoName("Frame", "frame", rest) };
        const out = [...rest.slice(0, insertPos), named, ...reparented, ...rest.slice(insertPos)];
        return { ...p, children: out };
      })
    }));
    history.commit();
    setSelection([frameId]);
    setSelCtx(commonParent);
  }

  function startMarquee(e) {
    const start = screenToWorld(e.clientX, e.clientY);
    const deepSelect = e.metaKey || e.ctrlKey;
    const ctxNode = selCtx ? children.find(c => c.id === selCtx) : null;
    const frameAtStart = !ctxNode ? deepestFrameAt(start.x, start.y) : null;
    let pool;
    if (deepSelect) {
      pool = children;
    } else if (ctxNode) {
      pool = children.filter(c => c.parentId === ctxNode.id);
    } else if (frameAtStart) {
      pool = children.filter(c => c.parentId === frameAtStart.id);
    } else {
      pool = children.filter(c => !c.parentId);
    }
    runMarquee(e, start, pool);
  }

  // Marquee explicitly scoped to a frame's direct children (used when the user
  // drags from a frame's empty space).
  function startMarqueeIn(e, frameId) {
    const start = screenToWorld(e.clientX, e.clientY);
    const pool = children.filter(c => c.parentId === frameId);
    runMarquee(e, start, pool);
  }

  function runMarquee(e, start, pool) {
    setDrag({ kind: "marquee", x: start.x, y: start.y, w: 0, h: 0 });
    const move = (ev) => {
      const cur = screenToWorld(ev.clientX, ev.clientY);
      const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y);
      const w = Math.abs(cur.x - start.x), h = Math.abs(cur.y - start.y);
      setDrag({ kind: "marquee", x, y, w, h });
      const hits = pool.filter(c =>
        c.x < x + w && c.x + c.w > x && c.y < y + h && c.y + c.h > y
      ).map(c => c.id);
      setSelection(e.shiftKey ? Array.from(new Set([...selection, ...hits])) : hits);
    };
    const up = () => {
      setDrag(null);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // ---------- Resize handle drag ----------
  const startResize = (e, handleId) => {
    e.stopPropagation();
    if (selection.length !== 1) return;
    const id = selection[0];
    const n = children.find(c => c.id === id);
    if (!n) return;
    const startWorld = screenToWorld(e.clientX, e.clientY);
    const orig = G(n); // resolved (hug/fill-aware) bounds, not stale stored w/h
    // An auto-layout frame can never be smaller than its content (padding +
    // children + gaps) — otherwise dragging a handle inward collapses it to a
    // sliver and clips everything inside. Compute that minimum once.
    const minContent = (n.type === "frame" && n.autoLayout)
      ? (() => {
          try { return window.LayoutEngine.measure({ ...n, layoutSizingH: "hug", layoutSizingV: "hug" }, childrenRef.current); }
          catch (_) { return null; }
        })()
      : null;
    history.snapshot();
    const move = (ev) => {
      const w = screenToWorld(ev.clientX, ev.clientY);
      const dx = w.x - startWorld.x, dy = w.y - startWorld.y;

      // Resize is ANCHORED at the opposite edge/corner of the dragged handle.
      // The anchor is the point that must stay fixed during the drag — so
      // dragging the top-left handle keeps the bottom-right corner pinned,
      // dragging the right edge keeps the left edge pinned, etc. Computing
      // (nw, nh) first then deriving (nx, ny) from the anchor guarantees
      // the shape never drifts when min-size clamps or aspect-ratio kicks
      // in (previous code did position-then-size and went wrong on both).
      const hasL = handleId.includes("l");
      const hasR = handleId.includes("r");
      const hasT = handleId.includes("t");
      const hasB = handleId.includes("b");
      const ax = hasL ? orig.x + orig.w : hasR ? orig.x : orig.x + orig.w / 2;
      const ay = hasT ? orig.y + orig.h : hasB ? orig.y : orig.y + orig.h / 2;

      let nw = hasL ? orig.w - dx : hasR ? orig.w + dx : orig.w;
      let nh = hasT ? orig.h - dy : hasB ? orig.h + dy : orig.h;

      // Shift = constrain to original aspect ratio. Only meaningful for
      // corner handles (edges constrain to a single axis already). Pick the
      // axis with the larger relative delta as the "leader".
      const isCorner = (hasL || hasR) && (hasT || hasB);
      if (ev.shiftKey && isCorner && orig.w > 0 && orig.h > 0) {
        const ratio = orig.w / orig.h;
        if (Math.abs(dx) > Math.abs(dy)) nh = nw / ratio;
        else nw = nh * ratio;
      }

      // Clamp to minimum size BEFORE deriving position.
      if (nw < 1) nw = 1;
      if (nh < 1) nh = 1;
      // Auto-layout frames clamp to their content size (Figma behavior) so an
      // accidental inward drag can't collapse the frame and hide its children.
      if (minContent) {
        if (nw < minContent.w) nw = minContent.w;
        if (nh < minContent.h) nh = minContent.h;
      }

      // Derive position from the anchor + new dimensions.
      let nx = hasL ? ax - nw : hasR ? ax : ax - nw / 2;
      let ny = hasT ? ay - nh : hasB ? ay : ay - nh / 2;

      // Text nodes: auto-height on width resize
      let patch = { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) };
      // Dragging a handle on a Hug or Fill axis converts that axis to Fixed,
      // baking the dragged size in — exactly like Figma. Without this, the
      // engine would ignore the new stored size (hug recomputes from kids;
      // fill recomputes from the parent) and the handle would feel dead.
      const wChanged = handleId.includes("l") || handleId.includes("r");
      const hChanged = handleId.includes("t") || handleId.includes("b");
      if (wChanged && (n.layoutSizingH === "hug" || n.layoutSizingH === "fill")) patch.layoutSizingH = "fixed";
      if (hChanged && (n.layoutSizingV === "hug" || n.layoutSizingV === "fill")) patch.layoutSizingV = "fixed";
      if (n.type === "text" && window.measureText) {
        const widthChanged = handleId.includes("l") || handleId.includes("r");
        const heightChanged = handleId.includes("t") || handleId.includes("b");
        if (widthChanged && !heightChanged) {
          // Promote to auto-h, recompute height from wrapped text
          patch.sizingMode = "auto-h";
          const m = window.measureText(n.text || "", {
            fontFamily: n.fontFamily, fontSize: n.fontSize, fontWeight: n.fontWeight,
            lineHeight: lineHeightCss(n), letterSpacing: n.letterSpacing,
            maxWidth: patch.w,
            textTransform: n.textCase === "upper" ? "uppercase"
                         : n.textCase === "lower" ? "lowercase"
                         : n.textCase === "title" ? "capitalize"
                                                  : "none",
          });
          patch.h = m.h;
          // If resizing from the top handle, y doesn't move on height-only changes; reset here
          patch.y = orig.y;
        } else if (heightChanged && !widthChanged) {
          // Fixed mode — user explicitly wants a set height
          patch.sizingMode = "fixed";
        } else if (widthChanged && heightChanged) {
          patch.sizingMode = "fixed";
        }
      }
      // Vector (pen) nodes: scale every anchor + handle about the node's
      // top-left so the path itself resizes with the bbox (otherwise only the
      // bounding box changed and the curve stayed put). Always derived from the
      // ORIGINAL points (n is captured once), so repeated moves never drift.
      if (n.type === "pen" && Array.isArray(n.points) && orig.w > 0 && orig.h > 0) {
        const sx = patch.w / orig.w, sy = patch.h / orig.h;
        const sh = (h) => h ? { x: h.x * sx, y: h.y * sy } : undefined;
        patch.points = n.points.map(p => {
          const np = { ...p, x: p.x * sx, y: p.y * sy };
          if (p.hIn) np.hIn = sh(p.hIn);
          if (p.hOut) np.hOut = sh(p.hOut);
          return np;
        });
      }
      updateNode(id, patch);
    };
    const up = () => { history.commit(); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Double-click: Figma-style DRILL-DOWN. Single-click selects the outermost
  // frame; each double-click descends one level toward the element under the
  // cursor (entering that frame as the selection context), until it reaches the
  // deepest element. A text node at the target enters text editing.
  const onDoubleClick = (e) => {
    if (tool !== "select") return;
    const w = screenToWorld(e.clientX, e.clientY);
    const deepId = hitTest(children, w.x, w.y, { deep: true });
    const deepNode = deepId ? children.find(c => c.id === deepId) : null;
    if (!deepNode) return;

    // Ancestor path from the outermost frame down to the deepest hit.
    const path = [];
    for (let c = deepNode; c; c = c.parentId ? children.find(x => x.id === c.parentId) : null) {
      path.unshift(c);
    }
    // The preceding mousedown already selected the current level; descend one
    // step past it along the path.
    const selId = selection.length === 1 ? selection[0] : null;
    const selIdx = selId ? path.findIndex(n => n.id === selId) : -1;
    const toSelect = path[selIdx + 1] || deepNode;

    setSelection([toSelect.id]);
    setSelCtx(toSelect.parentId || null);
    if (toSelect.type === "text") setEditingText(toSelect.id);
  };
  // Figma-style: single-click selects the *topmost frame ancestor*. Double-click
  // (or already-inside a frame) drills into children.
  function hitTestFlat(nodes, x, y) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.hidden || n.locked) continue;
      const b = G(n);
      if (n.type === "line") {
        const dx = b.w, dy = b.h;
        const len2 = dx * dx + dy * dy || 1;
        const t = clamp(((x - b.x) * dx + (y - b.y) * dy) / len2, 0, 1);
        const px = b.x + t * dx, py = b.y + t * dy;
        const d = Math.hypot(x - px, y - py);
        if (d < Math.max(8, (n.stroke?.weight || 2))) return n.id;
      } else {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return n.id;
      }
    }
    return null;
  }
  function hitTest(nodes, x, y, { deep = false, within = null } = {}) {
    // If `within` is given, only consider nodes whose ancestor chain includes it.
    // If deep=false (default), prefer the outermost frame ancestor — like Figma.
    const hit = hitTestFlat(nodes, x, y);
    if (!hit) return null;
    if (deep) return hit;
    // Walk up to find the topmost frame ancestor — that's what single-click selects
    let current = nodes.find(n => n.id === hit);
    while (current?.parentId) {
      const parent = nodes.find(n => n.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current?.id || hit;
  }

  // ---------- Hover for preview ----------
  const onMouseMove = (e) => {
    cursorWorldRef.current = screenToWorld(e.clientX, e.clientY);
    if (tool !== "select") { setHoveredId(null); return; }
    const w = screenToWorld(e.clientX, e.clientY);
    // Prefer hits whose parent === current selection-context, mirroring click rules.
    const candidates = [];
    for (let i = children.length - 1; i >= 0; i--) {
      const n = children[i];
      if (n.hidden || n.locked) continue;
      const b = G(n);
      let inside;
      if (n.type === "line") {
        const dx = b.w, dy = b.h;
        const len2 = dx*dx + dy*dy || 1;
        const t = clamp(((w.x - b.x)*dx + (w.y - b.y)*dy)/len2, 0, 1);
        inside = Math.hypot(w.x - (b.x + t*dx), w.y - (b.y + t*dy)) < Math.max(8, n.stroke?.weight || 2);
      } else {
        inside = w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
      }
      if (inside) candidates.push(n);
    }
    const inCtx = selCtx
      ? candidates.find(n => (n.parentId || null) === selCtx)
      : candidates.find(n => n.type !== "frame");
    let hover = inCtx?.id || null;
    if (!hover && !selCtx) {
      // Mirror onMouseDown's root rule: don't highlight filled root frames on body hover.
      const cand = candidates[0];
      if (cand) {
        const isRootFrame = cand.type === "frame" && !cand.parentId;
        const hasKids = isRootFrame && children.some(c => c.parentId === cand.id);
        if (!(isRootFrame && hasKids)) hover = cand.id;
      }
    } else if (!hover) {
      hover = candidates[0]?.id || null;
    }
    setHoveredId(hover);
  };

  // Compute the cumulative transform applied to a node by its ancestor chain
  // (rotation + flip propagate from parent → child via CSS). Returns the
  // visually-effective center of the node's bbox plus the composed rotation
  // and scale signs, in WORLD coords. Used by the selection chrome to
  // position itself correctly when the node lives inside a flipped/rotated
  // parent — otherwise the chrome stays at the stored bbox while the shape
  // visually drifts away.
  // Resolve a node's *rendered* world top-left. For a plain (absolutely
  // positioned) chain this just telescopes back to the node's stored x/y.
  // But when an ancestor frame has auto-layout ON, the child is drawn at a
  // cursor-computed offset inside that frame — NOT at its stored x/y — so the
  // chrome must mirror the same math or it drifts off the shape.
  const effectivePos = useCallback((node) => {
    const g = geom.get(node.id);
    if (g) return { x: g.x, y: g.y };
    return { x: node.x, y: node.y };
  }, [geom]);

  const cumulativeTransform = useCallback((node) => {
    const ep = effectivePos(node);
    const gb = G(node);
    let cx = ep.x + gb.w / 2;
    let cy = ep.y + gb.h / 2;
    let angle = node.rotation || 0;
    let sx = node.flipH ? -1 : 1;
    let sy = node.flipV ? -1 : 1;
    let cur = node.parentId ? children.find(c => c.id === node.parentId) : null;
    while (cur) {
      const ap = effectivePos(cur);
      const ab = G(cur);
      const acx = ap.x + ab.w / 2;
      const acy = ap.y + ab.h / 2;
      const aAng = cur.rotation || 0;
      const aSx = cur.flipH ? -1 : 1;
      const aSy = cur.flipV ? -1 : 1;
      // Transform the running center around the ancestor's center.
      let dx = (cx - acx) * aSx;
      let dy = (cy - acy) * aSy;
      const r = (aAng * Math.PI) / 180;
      const cos = Math.cos(r), sin = Math.sin(r);
      const ndx = dx * cos - dy * sin;
      const ndy = dx * sin + dy * cos;
      cx = ndx + acx;
      cy = ndy + acy;
      // Compose orientation. Rotation adds; flips XOR (multiply ±1).
      angle += aAng;
      sx *= aSx;
      sy *= aSy;
      cur = cur.parentId ? children.find(c => c.id === cur.parentId) : null;
    }
    return { cx, cy, angle, sx, sy };
  }, [children, effectivePos, G]);

  // Render selection bounds (union of selected)
  const selBounds = selection.length
    ? (() => {
        const sel = children.filter(c => selection.includes(c.id));
        if (!sel.length) return null;
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        sel.forEach(n => {
          const ep = effectivePos(n);
          const gb = G(n);
          const bx1 = n.type === "line" ? Math.min(ep.x, ep.x + gb.w) : ep.x;
          const by1 = n.type === "line" ? Math.min(ep.y, ep.y + gb.h) : ep.y;
          const bx2 = n.type === "line" ? Math.max(ep.x, ep.x + gb.w) : ep.x + gb.w;
          const by2 = n.type === "line" ? Math.max(ep.y, ep.y + gb.h) : ep.y + gb.h;
          if (bx1 < x1) x1 = bx1; if (by1 < y1) y1 = by1;
          if (bx2 > x2) x2 = bx2; if (by2 > y2) y2 = by2;
        });
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      })()
    : null;

  const hoverNode = hoveredId && !selection.includes(hoveredId) ? children.find(c => c.id === hoveredId) : null;

  // ----- Memoized node tree -----
  // The rendered node DOM depends ONLY on the document (children), the
  // resolved geometry, and which text node is being edited — NOT on pan,
  // zoom, hover or selection (those live in the separate chrome layer). So we
  // memoize the whole tree: panning/zooming/hovering/selecting a 10k-node
  // document rebuilds zero node elements. The layout engine memoizes geometry
  // upstream, so during a drag only the touched subtree's geometry changes
  // and React reconciles just the moved nodes.
  const nodeTree = React.useMemo(() => {
    const byParent = {};
    children.forEach(n => {
      const pid = n.parentId || "__root__";
      (byParent[pid] = byParent[pid] || []).push(n);
    });
    const renderNode = (n) => {
      const kids = byParent[n.id] || [];
      const isFrame = n.type === "frame";
      const gb = geom.get(n.id) || { x: n.x, y: n.y, w: n.w, h: n.h };
      const pgb = n.parentId ? geom.get(n.parentId) : null;
      const relX = pgb ? gb.x - pgb.x : gb.x;
      const relY = pgb ? gb.y - pgb.y : gb.y;
      const rn = (gb.w !== n.w || gb.h !== n.h) ? { ...n, w: gb.w, h: gb.h } : n;
      return (
        <div key={n.id}
             data-node-id={n.id}
             className={isFrame ? "frame" : "shape"}
             style={{
               position: "absolute",
               left: relX, top: relY,
               width: n.type === "line" ? Math.max(1, Math.abs(gb.w)) : gb.w,
               height: n.type === "line" ? Math.max(1, Math.abs(gb.h)) : gb.h,
               transform: (n.rotation || n.flipH || n.flipV)
                 ? [
                     n.rotation ? `rotate(${n.rotation}deg)` : null,
                     (n.flipH || n.flipV) ? `scale(${n.flipH ? -1 : 1}, ${n.flipV ? -1 : 1})` : null,
                   ].filter(Boolean).join(" ")
                 : undefined,
               transformOrigin: "center",
               display: n.hidden ? "none" : undefined,
               overflow: isFrame && n.clipContent !== false ? "hidden" : "visible",
               borderRadius: isFrame ? (n.radius || 0) : undefined,
             }}>
          {renderShape(rn, editingText === n.id, (newText, flag, newW, newH) => {
            if (flag === "__delete__") {
              deleteNodes([n.id]);
            } else {
              const patch = { text: newText };
              if (newW != null) patch.w = newW;
              if (newH != null) {
                const paraCount = (newText.match(/\n/g) || []).length;
                const extraH = paraCount * (n.paragraphSpacing || 0);
                patch.h = newH + extraH;
              }
              updateNode(n.id, patch);
            }
            setEditingText(null);
          })}
          {kids.map(c => renderNode(c))}
        </div>
      );
    };
    return (byParent.__root__ || []).map(n => renderNode(n));
  }, [children, geom, editingText, updateNode, deleteNodes]);

  // Commit pen on Enter / Escape (close path)
  useEffect(() => {
    const k = (e) => {
      if (tool === "pen" && (e.key === "Enter" || e.key === "Escape")) {
        if (selection.length) {
          const id = selection[0];
          const n = children.find(c => c.id === id);
          if (n?.type === "pen" && n.points.length > 1) {
            // Recompute bbox (handles included so curves aren't clipped)
            const b = penBounds(n.points);
            updateNode(id, {
              x: n.x + b.minX, y: n.y + b.minY,
              w: Math.max(1, b.maxX - b.minX), h: Math.max(1, b.maxY - b.minY),
              points: n.points.map(p => ({ ...p, x: p.x - b.minX, y: p.y - b.minY })),
              closed: e.key === "Enter",
            });
          }
        }
        setTool("select");
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [tool, selection, children, updateNode]);

  // When the user switches AWAY from the pen tool with an open path still
  // in progress, finalize that path so we don't leave a 1×1 stub on the
  // canvas. Mirrors the Enter-key commit, except a path with <2 points is
  // discarded (no visible shape worth keeping).
  const prevToolRef2 = useRef(tool);
  useEffect(() => {
    const prev = prevToolRef2.current;
    prevToolRef2.current = tool;
    if (prev !== "pen" || tool === "pen") return;
    // Find any open pen and clean it up.
    const orphan = children.find(c => c.type === "pen" && !c.closed);
    if (!orphan) return;
    if ((orphan.points?.length || 0) < 2) {
      deleteNodes([orphan.id]);
    } else {
      // Same finalization math as the Enter handler (handles included).
      const b = penBounds(orphan.points);
      updateNode(orphan.id, {
        x: orphan.x + b.minX, y: orphan.y + b.minY,
        w: Math.max(1, b.maxX - b.minX), h: Math.max(1, b.maxY - b.minY),
        points: orphan.points.map(p => ({ ...p, x: p.x - b.minX, y: p.y - b.minY })),
        closed: false,
      });
    }
  }, [tool, children, updateNode, deleteNodes]);

  // Canvas class list
  const scrollerCls = `canvas-scroller tool-${tool}${spaceHeld ? " pan-ready" : ""}`;

  // Effective canvas background: a page-level bg paint overrides the global
  // canvas background tweak when present + visible.
  const pageBgColor = (page?.bg && page.bg.visible !== false)
    ? hexToRgba(page.bg.color, page.bg.opacity ?? 1)
    : canvasBg;

  return (
    <div className="canvas-area"
         ref={canvasRef}
         style={{ background: pageBgColor }}>

      {rulers && <Rulers pan={pan} zoom={zoom} width={canvasSize.w} height={canvasSize.h} onGuideStart={onGuideStart} />}

      <div className={scrollerCls}
           onMouseDown={onMouseDown}
           onMouseMove={onMouseMove}
           onDoubleClick={onDoubleClick}
           onWheel={onWheel}
           style={{ top: rulers ? 24 : 0, left: rulers ? 24 : 0 }}>

        <div className="canvas-world"
             style={{ transform: `translate(${pan.x - (rulers ? 24 : 0)}px, ${pan.y - (rulers ? 24 : 0)}px) scale(${zoom})`, "--zoom": zoom }}>

          {/* Render as a tree: each parent contains its children with relative
              coords. Memoized (see nodeTree) so pan/zoom/hover/select don't
              rebuild it. */}
          {nodeTree}

        </div>

        {/* ============================================================
            Selection chrome layer — lives OUTSIDE the scaled canvas-world
            so 1px borders / 8px handles stay crisp at any zoom (sub-pixel
            border widths get rounded by the browser then amplified by
            scale(), which is what made the "frame bounding box" appear
            thick at 1600%). Positions are world * zoom; sizes stay in
            screen px.
            ============================================================ */}
        <div className="canvas-chrome"
             style={{
               position: "absolute",
               top: 0, left: 0,
               width: 0, height: 0,
               pointerEvents: "none",
               transform: `translate(${pan.x - (rulers ? 24 : 0)}px, ${pan.y - (rulers ? 24 : 0)}px)`,
             }}>

          {/* Hover outline */}
          {hoverNode && (() => {
            const hb = G(hoverNode); // resolved (hug/fill-aware) bounds
            const isLine = hoverNode.type === "line";
            const ww = isLine ? Math.abs(hb.w) : hb.w;
            const wh = isLine ? Math.abs(hb.h) : hb.h;
            // Mirror the cumulative rotation/flip of the node + its
            // ancestors so the outline follows the rendered shape.
            const cum = cumulativeTransform(hoverNode);
            const parts = [];
            if (cum.angle) parts.push(`rotate(${cum.angle}deg)`);
            if (cum.sx !== 1 || cum.sy !== 1) parts.push(`scale(${cum.sx}, ${cum.sy})`);
            const w = ww * zoom, h = wh * zoom;
            const left = cum.cx * zoom - w / 2;
            const top  = cum.cy * zoom - h / 2;
            return (
              <div style={{
                position: "absolute",
                left, top, width: w, height: h,
                border: "1px solid var(--accent)",
                boxSizing: "border-box",
                pointerEvents: "none",
                transform: parts.length ? parts.join(" ") : undefined,
                transformOrigin: "center",
              }} />
            );
          })()}

          {/* Active selection-context frame indicator */}
          {selCtx && (() => {
            const ctxNode = children.find(c => c.id === selCtx);
            if (!ctxNode) return null;
            const cb = G(ctxNode);
            const cum = cumulativeTransform(ctxNode);
            const parts = [];
            if (cum.angle) parts.push(`rotate(${cum.angle}deg)`);
            if (cum.sx !== 1 || cum.sy !== 1) parts.push(`scale(${cum.sx}, ${cum.sy})`);
            const w = cb.w * zoom, h = cb.h * zoom;
            const left = cum.cx * zoom - w / 2;
            const top  = cum.cy * zoom - h / 2;
            return (
              <div style={{
                position: "absolute",
                left, top, width: w, height: h,
                border: "1.5px solid var(--accent)",
                opacity: 0.45,
                pointerEvents: "none",
                boxSizing: "border-box",
                transform: parts.length ? parts.join(" ") : undefined,
                transformOrigin: "center",
              }} />
            );
          })()}

          {/* Spacing guides — distance between selection bbox and the
              hovered (unselected) node. Mirrors Figma: 4 directional gaps
              drawn as red lines + labels in world space. */}
          {selBounds && hoverNode && !editingText && !drag && (() => {
            const S = selBounds;
            const H = hoverNode;
            const Hep = effectivePos(H);
            const Hgb = G(H);
            const Sl = S.x, Sr = S.x + S.w, St = S.y, Sb = S.y + S.h;
            const Hl = Hep.x, Hr = Hep.x + Hgb.w, Ht = Hep.y, Hb = Hep.y + Hgb.h;
            const items = [];
            // Horizontal gap (left/right). Drawn at the vertical midpoint
            // of the overlap range; if no overlap, use the selection's
            // vertical midpoint.
            const overlapTop  = Math.max(St, Ht);
            const overlapBot  = Math.min(Sb, Hb);
            const yMid = overlapTop <= overlapBot ? (overlapTop + overlapBot) / 2 : (St + Sb) / 2;
            if (Hl >= Sr)      items.push({ kind: "h", x1: Sr, x2: Hl, y: yMid, gap: Hl - Sr });
            else if (Hr <= Sl) items.push({ kind: "h", x1: Hr, x2: Sl, y: yMid, gap: Sl - Hr });
            // Vertical gap (top/bottom).
            const overlapLeft  = Math.max(Sl, Hl);
            const overlapRight = Math.min(Sr, Hr);
            const xMid = overlapLeft <= overlapRight ? (overlapLeft + overlapRight) / 2 : (Sl + Sr) / 2;
            if (Ht >= Sb)      items.push({ kind: "v", x: xMid, y1: Sb, y2: Ht, gap: Ht - Sb });
            else if (Hb <= St) items.push({ kind: "v", x: xMid, y1: Hb, y2: St, gap: St - Hb });
            if (!items.length) return null;
            const RED = "#FF3B30";
            return items.map((g, i) => {
              if (g.kind === "h") {
                const x1 = g.x1 * zoom, x2 = g.x2 * zoom, y = g.y * zoom;
                return (
                  <React.Fragment key={i}>
                    {/* main horizontal line */}
                    <div style={{ position: "absolute", left: x1, top: y - 0.5, width: x2 - x1, height: 1, background: RED, pointerEvents: "none" }}/>
                    {/* end caps */}
                    <div style={{ position: "absolute", left: x1 - 0.5, top: y - 3, width: 1, height: 6, background: RED, pointerEvents: "none" }}/>
                    <div style={{ position: "absolute", left: x2 - 0.5, top: y - 3, width: 1, height: 6, background: RED, pointerEvents: "none" }}/>
                    {/* distance label */}
                    <div style={{ position: "absolute",
                                  left: (x1 + x2) / 2, top: y + 4,
                                  transform: "translateX(-50%)",
                                  background: RED, color: "white",
                                  fontSize: 10, fontWeight: 600, lineHeight: 1.4,
                                  padding: "1px 5px", borderRadius: 3,
                                  pointerEvents: "none", whiteSpace: "nowrap" }}>
                      {Math.round(g.gap)}
                    </div>
                  </React.Fragment>
                );
              } else {
                const x = g.x * zoom, y1 = g.y1 * zoom, y2 = g.y2 * zoom;
                return (
                  <React.Fragment key={i}>
                    <div style={{ position: "absolute", left: x - 0.5, top: y1, width: 1, height: y2 - y1, background: RED, pointerEvents: "none" }}/>
                    <div style={{ position: "absolute", left: x - 3, top: y1 - 0.5, width: 6, height: 1, background: RED, pointerEvents: "none" }}/>
                    <div style={{ position: "absolute", left: x - 3, top: y2 - 0.5, width: 6, height: 1, background: RED, pointerEvents: "none" }}/>
                    <div style={{ position: "absolute",
                                  left: x + 4, top: (y1 + y2) / 2,
                                  transform: "translateY(-50%)",
                                  background: RED, color: "white",
                                  fontSize: 10, fontWeight: 600, lineHeight: 1.4,
                                  padding: "1px 5px", borderRadius: 3,
                                  pointerEvents: "none", whiteSpace: "nowrap" }}>
                      {Math.round(g.gap)}
                    </div>
                  </React.Fragment>
                );
              }
            });
          })()}

          {/* Selection box + handles + size badge */}
          {selBounds && !editingText && (() => {
            // For a SINGLE selected node, compute its visually-effective
            // center + cumulative rotation/flip from the ancestor chain.
            // This makes the selection chrome land on the rendered shape
            // even when an ancestor frame is flipped or rotated.
            const single = selection.length === 1 ? children.find(c => c.id === selection[0]) : null;
            const cum = single ? cumulativeTransform(single) : null;
            const xformParts = [];
            if (cum) {
              if (cum.angle) xformParts.push(`rotate(${cum.angle}deg)`);
              if (cum.sx !== 1 || cum.sy !== 1) xformParts.push(`scale(${cum.sx}, ${cum.sy})`);
            }
            const xform = xformParts.length ? xformParts.join(" ") : undefined;
            // Position the chrome's bbox so its CENTER lands on cum.{cx,cy}.
            // selBounds is already the union bbox (just one node here), so
            // we use its w/h but reposition around the cumulative center.
            const w = selBounds.w * zoom;
            const h = selBounds.h * zoom;
            const cxScreen = cum ? cum.cx * zoom : (selBounds.x + selBounds.w / 2) * zoom;
            const cyScreen = cum ? cum.cy * zoom : (selBounds.y + selBounds.h / 2) * zoom;
            const left = cxScreen - w / 2;
            const top  = cyScreen - h / 2;
            return (
            <>
              <div style={{
                position: "absolute",
                left, top, width: w, height: h,
                border: "1px solid var(--accent)",
                pointerEvents: "none",
                boxSizing: "border-box",
                transform: xform,
                transformOrigin: "center", // box's own center == bbox center
              }} />
              {selection.length === 1 && (() => {
                const n = single;
                if (!n || n.type === "line") return null;
                const hs = 8; // screen px
                const sx = left, sy = top;
                const sw = w, sh = h;
                const handles = [
                  ["tl", sx,         sy],
                  ["tm", sx + sw/2,  sy],
                  ["tr", sx + sw,    sy],
                  ["lm", sx,         sy + sh/2],
                  ["rm", sx + sw,    sy + sh/2],
                  ["bl", sx,         sy + sh],
                  ["bm", sx + sw/2,  sy + sh],
                  ["br", sx + sw,    sy + sh],
                ];
                return handles.map(([id, hx, hy]) => {
                  // transform-origin is RELATIVE to this handle's own box.
                  // Point the origin at the chrome's center so the handle
                  // rotates/flips around the shape's pivot.
                  const ox = cxScreen - (hx - hs / 2);
                  const oy = cyScreen - (hy - hs / 2);
                  return (
                    <div key={id} className={`handle ${id}`}
                         onMouseDown={(e) => startResize(e, id)}
                         style={{
                           left: hx - hs/2, top: hy - hs/2,
                           width: hs, height: hs,
                           borderWidth: "1px",
                           pointerEvents: "auto",
                           transform: xform,
                           transformOrigin: `${ox}px ${oy}px`,
                         }} />
                  );
                });
              })()}
              <div className="size-badge"
                   style={{
                     left: cxScreen,
                     top:  top + h + 8,
                     transform: "translateX(-50%)",
                   }}>
                {Math.round(selBounds.w)} × {Math.round(selBounds.h)}
              </div>
            </>
            );
          })()}

          {/* Pen-tool overlay: anchors + Bézier handles for the path being
              drawn. Positions are world*zoom (chrome layer is pan-translated);
              the SVG is 1×1 with overflow:visible so it can paint anywhere. */}
          {tool === "pen" && (() => {
            const pen = selection.length
              ? children.find(c => c.id === selection[0] && c.type === "pen" && !c.closed)
              : null;
            if (!pen || !pen.points.length) return null;
            const A = "var(--accent)";
            return (
              <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} width="1" height="1">
                {pen.points.map((pt, i) => {
                  const ax = (pen.x + pt.x) * zoom, ay = (pen.y + pt.y) * zoom;
                  const hpt = (h) => [(pen.x + pt.x + h.x) * zoom, (pen.y + pt.y + h.y) * zoom];
                  const isFirst = i === 0 && pen.points.length >= 2;
                  return (
                    <g key={i}>
                      {pt.hIn && (() => { const [hx, hy] = hpt(pt.hIn); return (
                        <g>
                          <line x1={ax} y1={ay} x2={hx} y2={hy} stroke={A} strokeWidth="1" />
                          <circle cx={hx} cy={hy} r="3.5" fill="white" stroke={A} strokeWidth="1.5" />
                        </g>
                      ); })()}
                      {pt.hOut && (() => { const [hx, hy] = hpt(pt.hOut); return (
                        <g>
                          <line x1={ax} y1={ay} x2={hx} y2={hy} stroke={A} strokeWidth="1" />
                          <circle cx={hx} cy={hy} r="3.5" fill="white" stroke={A} strokeWidth="1.5" />
                        </g>
                      ); })()}
                      {/* Anchor square. The first anchor is filled once the path
                          has 2+ points to signal "click here to close". */}
                      <rect x={ax - 3.5} y={ay - 3.5} width="7" height="7"
                            fill={isFirst ? A : "white"} stroke={A} strokeWidth="1.5" />
                    </g>
                  );
                })}
              </svg>
            );
          })()}

          {/* Auto-layout reorder drop indicator */}
          {reorderHint && (
            <div style={{
              position: "absolute",
              left: reorderHint.x * zoom - (reorderHint.isRow ? 1 : 0),
              top: reorderHint.y * zoom - (reorderHint.isRow ? 0 : 1),
              width: reorderHint.isRow ? 2 : reorderHint.len * zoom,
              height: reorderHint.isRow ? reorderHint.len * zoom : 2,
              background: "var(--accent)",
              borderRadius: 1,
              pointerEvents: "none",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
            }} />
          )}

          {/* Snap lines */}
          {snaps.map((s, i) => s.type === "v" ? (
            <div key={i} className="snap-line" style={{ left: s.at * zoom, top: -9999, width: 1, height: 99999 }} />
          ) : (
            <div key={i} className="snap-line" style={{ top: s.at * zoom, left: -9999, height: 1, width: 99999 }} />
          ))}

          {/* Marquee */}
          {drag?.kind === "marquee" && (
            <div className="marquee" style={{
              left: drag.x * zoom, top: drag.y * zoom,
              width: drag.w * zoom, height: drag.h * zoom,
            }} />
          )}

          {/* Zoom-tool marquee — drawn slightly differently from the select
              marquee so the user can tell which mode they're in. */}
          {drag?.kind === "zoom-marquee" && (
            <div className="zoom-marquee" style={{
              left: drag.x * zoom, top: drag.y * zoom,
              width: drag.w * zoom, height: drag.h * zoom,
            }} />
          )}

          {/* Ruler guides — solid lines spanning the canvas. Stored per page
              in world coords; rendered in the chrome layer in screen space.
              Click and drag a guide to move it; drag it back onto its
              originating ruler to delete it. */}
          {guides.map((g, i) => (
            g.kind === "h" ? (
              <div key={`gd-${i}`}
                   className="guide guide-h"
                   onMouseDown={(e) => onGuideDrag(i, e)}
                   style={{
                     position: "absolute",
                     left: -100000, top: g.at * zoom,
                     width: 200000, height: 1,
                   }} />
            ) : (
              <div key={`gd-${i}`}
                   className="guide guide-v"
                   onMouseDown={(e) => onGuideDrag(i, e)}
                   style={{
                     position: "absolute",
                     left: g.at * zoom, top: -100000,
                     width: 1, height: 200000,
                   }} />
            )
          ))}

          {/* Live preview while drag-creating or repositioning a guide. */}
          {previewGuide && (
            previewGuide.kind === "h" ? (
              <div className="guide guide-preview"
                   style={{
                     position: "absolute",
                     left: -100000, top: previewGuide.at * zoom,
                     width: 200000, height: 1,
                   }} />
            ) : (
              <div className="guide guide-preview"
                   style={{
                     position: "absolute",
                     left: previewGuide.at * zoom, top: -100000,
                     width: 1, height: 200000,
                   }} />
            )
          )}

          {/* Persistent frame labels — ROOT FRAMES ONLY (artboards).
              Nested frames don't get a label on the canvas; rename them from
              the Layers panel. Rendered in screen space so they:
              - never get clipped by a parent frame's overflow:hidden
              - stay at a constant 11px regardless of zoom
              - sit just above each frame's top-left corner. */}
          {children.filter(c => c.type === "frame" && !c.hidden && !c.parentId).map(f => (
            <FrameLabel
              key={`label-${f.id}`}
              node={f}
              isSelected={selection.includes(f.id)}
              screenX={f.x * zoom}
              screenY={f.y * zoom}
              screenW={f.w * zoom}
              onSelect={(e) => {
                if (e?.shiftKey) {
                  setSelection(selection.includes(f.id)
                    ? selection.filter(id => id !== f.id)
                    : [...selection, f.id]);
                } else if (!selection.includes(f.id)) {
                  setSelection([f.id]);
                }
                setSelCtx(f.parentId || null);
                // Click-and-drag on the label moves the frame (and its descendants).
                if (e && !e.shiftKey) startMove(e, [f.id]);
              }}
              onRename={(name) => { history.snapshot(); updateNode(f.id, { name }); history.commit(); }}
            />
          ))}
        </div>

      </div>
    </div>
  );
}

export { Canvas };
