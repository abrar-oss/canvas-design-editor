// Self-serve Figma import: fetch a design via Figma's REST API (with the user's
// personal access token) and convert its node tree into editor nodes.
//
// Coordinates: we use each node's absoluteBoundingBox (world coords), offset so
// the design lands near the origin. This sidesteps replicating Figma's
// auto-layout — absolute positions already match what's on screen.

const API = "https://api.figma.com/v1";

export function parseFigmaUrl(url) {
  let u;
  try { u = new URL(url.trim()); } catch { throw new Error("That doesn't look like a URL."); }
  if (!/figma\.com$/.test(u.hostname) && !/\.figma\.com$/.test(u.hostname)) {
    throw new Error("Not a figma.com link.");
  }
  const m = u.pathname.match(/\/(?:design|file|proto)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error("Couldn't find a file key in the URL (need a /design/ or /file/ link).");
  let nodeId = u.searchParams.get("node-id");
  if (nodeId) nodeId = nodeId.replace(/-/g, ":");
  return { fileKey: m[1], nodeId };
}

async function figmaGet(path, token) {
  const r = await fetch(API + path, { headers: { "X-Figma-Token": token } });
  if (r.status === 403) throw new Error("Access denied — check the token and that it can view this file.");
  if (r.status === 404) throw new Error("File or node not found.");
  if (r.status === 429) throw new Error("Figma rate limit hit — wait a moment and retry.");
  if (!r.ok) throw new Error("Figma API error " + r.status);
  return r.json();
}

export async function fetchFigmaDesign(fileKey, nodeId, token) {
  let root;
  if (nodeId) {
    const data = await figmaGet(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`, token);
    const entry = data.nodes[nodeId] || Object.values(data.nodes || {})[0];
    if (!entry || !entry.document) throw new Error("Node not found in the file.");
    root = entry.document;
  } else {
    const data = await figmaGet(`/files/${fileKey}`, token);
    const page = (data.document.children || [])[0];
    if (!page) throw new Error("Empty document.");
    // Prefer the first top-level frame on the page; else the page itself.
    root = (page.children || []).find(c => c.type === "FRAME") || page;
  }
  let imageMap = {};
  try {
    const imgs = await figmaGet(`/files/${fileKey}/images`, token);
    imageMap = (imgs.meta && imgs.meta.images) || {};
  } catch { /* image fills just won't resolve */ }
  return { root, imageMap };
}

// ---- Conversion -----------------------------------------------------------

function toHex(c) {
  const h = v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  return ("#" + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
}

function convertPaint(f, imageMap) {
  if (!f || f.visible === false) return null;
  const op = f.opacity ?? 1;
  if (f.type === "SOLID") {
    return { type: "solid", color: toHex(f.color), opacity: (f.color.a ?? 1) * op, visible: true };
  }
  if (f.type === "GRADIENT_LINEAR" || f.type === "GRADIENT_RADIAL") {
    const stops = (f.gradientStops || []).map(s => ({
      color: toHex(s.color), opacity: s.color.a ?? 1, position: s.position,
    }));
    if (f.type === "GRADIENT_RADIAL") return { type: "radial", opacity: op, visible: true, stops };
    let angle = 180;
    const h = f.gradientHandlePositions;
    if (h && h.length >= 2) {
      angle = Math.round((Math.atan2(h[1].y - h[0].y, h[1].x - h[0].x) * 180) / Math.PI + 90);
    }
    return { type: "linear", angle, opacity: op, visible: true, stops };
  }
  if (f.type === "IMAGE") {
    const src = imageMap[f.imageRef];
    if (!src) return null;
    const fit = f.scaleMode === "FIT" ? "contain" : f.scaleMode === "TILE" ? "tile" : "cover";
    return { type: "image", src, fit, opacity: op, visible: true };
  }
  return null;
}

function editorType(t) {
  switch (t) {
    case "FRAME": case "COMPONENT": case "COMPONENT_SET": case "INSTANCE": case "GROUP": case "SECTION":
      return "frame";
    case "RECTANGLE": return "rect";
    case "ELLIPSE": return "ellipse";
    case "TEXT": return "text";
    case "LINE": return "line";
    default: return "rect"; // VECTOR / STAR / POLYGON / BOOLEAN → approximate box
  }
}

export function figmaToEditorNodes(root, imageMap) {
  const out = [];
  const rb = root.absoluteBoundingBox || { x: 0, y: 0 };
  const ox = rb.x || 0, oy = rb.y || 0;
  let counter = 0;

  const walk = (n, parentId) => {
    const box = n.absoluteBoundingBox;
    if (!box) { (n.children || []).forEach(c => walk(c, parentId)); return; }
    const id = "fg_" + (counter++);
    const type = editorType(n.type);

    // Figma paints bottom→top; the editor paints first→top, so reverse.
    const fills = (n.fills || []).map(f => convertPaint(f, imageMap)).filter(Boolean).reverse();

    const node = {
      id, parentId, type,
      name: n.name || type,
      x: Math.round(box.x - ox),
      y: Math.round(box.y - oy),
      w: Math.max(1, Math.round(box.width)),
      h: Math.max(1, Math.round(box.height)),
      opacity: n.opacity ?? 1,
    };
    if (n.visible === false) node.hidden = true;
    if (fills.length) { node.fills = fills; node.fill = fills[0]; }

    const stroke = (n.strokes || []).find(s => s.type === "SOLID" && s.visible !== false);
    if (stroke && n.strokeWeight) {
      node.stroke = { color: toHex(stroke.color), weight: n.strokeWeight, opacity: (stroke.color.a ?? 1) * (stroke.opacity ?? 1) };
    }

    const r = typeof n.cornerRadius === "number" ? n.cornerRadius
            : Array.isArray(n.rectangleCornerRadii) ? Math.max(...n.rectangleCornerRadii) : 0;
    if (r) node.radius = Math.round(r);

    if (type === "frame") {
      node.clipContent = (n.type === "GROUP" || n.type === "SECTION") ? false : (n.clipsContent !== false);
      if (!fills.length) { node.fill = null; node.fills = []; }
    }

    if (type === "text") {
      const st = n.style || {};
      node.text = n.characters || "";
      node.fontFamily = st.fontFamily || "Inter";
      node.fontSize = Math.round(st.fontSize || 16);
      node.fontWeight = st.fontWeight || 400;
      if (st.letterSpacing) node.letterSpacing = Math.round(st.letterSpacing * 100) / 100;
      if (st.lineHeightPx) { node.lineHeight = Math.round(st.lineHeightPx); node.lineHeightUnit = "px"; }
      node.align = (st.textAlignHorizontal || "LEFT").toLowerCase();
      node.sizingMode = "fixed";
    }

    out.push(node);
    (n.children || []).forEach(c => walk(c, id));
  };

  walk(root, null);
  return out;
}

// One-shot: URL + token → editor nodes.
export async function importFromFigma(url, token) {
  const { fileKey, nodeId } = parseFigmaUrl(url);
  const { root, imageMap } = await fetchFigmaDesign(fileKey, nodeId, token);
  const nodes = figmaToEditorNodes(root, imageMap);
  if (!nodes.length) throw new Error("Nothing importable found at that node.");
  return nodes;
}
