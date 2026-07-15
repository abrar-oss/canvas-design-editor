// Export a DOM element (a frame/shape node, or the whole page) to PNG / JPEG /
// PDF. The canvas is DOM-based (divs / imgs / SVG), so we rasterize with
// html-to-image and, for PDF, embed the raster into a jsPDF page sized to the
// design.
import * as htmlToImage from "html-to-image";
import { jsPDF } from "jspdf";

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Rasterize an element. Capturing it in place fails when it's absolutely
// positioned at a world offset and/or nested under a `transform: scale()`
// ancestor (the design canvas) — its content gets pushed outside the capture
// box, producing a blank image. So we CLONE it into a clean, untransformed
// off-screen host at the origin and rasterize that.
//   capture.width/height  — output box (defaults to el's size)
//   capture.cloneTransform — transform applied to the clone (e.g. a translate
//                            to crop the whole page to its content bbox)
async function toRaster(el, format, scale, capture = {}) {
  const w = Math.max(1, Math.round(capture.width || el.offsetWidth || 1));
  const h = Math.max(1, Math.round(capture.height || el.offsetHeight || 1));

  // The host just holds the clone off-screen; html-to-image captures the CLONE
  // (capturing the fixed-positioned host wrapper renders blank). `width`/`height`
  // crop the output to the design box; a cloneTransform (e.g. a page-crop
  // translate) shifts the content into that box.
  const host = document.createElement("div");
  host.style.cssText = `position:fixed; left:-100000px; top:0; margin:0; padding:0; background:transparent;`;
  const clone = el.cloneNode(true);
  clone.style.position = "static";
  clone.style.left = "0px";
  clone.style.top = "0px";
  clone.style.margin = "0px";
  clone.style.transform = capture.cloneTransform || "none";
  clone.style.transformOrigin = "top left";
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    // skipFonts: avoids html-to-image inlining cross-origin Google-Fonts
    // stylesheets (SecurityError + per-export refetch). Text falls back to the
    // system sans (≈ Inter).
    const opts = { pixelRatio: scale, cacheBust: true, skipFonts: true, width: w, height: h };
    if (format === "jpeg") {
      return await htmlToImage.toJpeg(clone, { ...opts, quality: 0.95, backgroundColor: "#ffffff" });
    }
    return await htmlToImage.toPng(clone, opts);
  } finally {
    host.remove();
  }
}

/**
 * @param el        DOM element to capture
 * @param format    "png" | "jpeg" | "pdf"
 * @param scale     output pixel ratio (2 = retina)
 * @param name      base filename (no extension)
 * @param width/height  logical size in px (for PDF page + cropping)
 * @param capture   extra html-to-image options (width/height/style for cropping)
 */
export async function exportDesign({ el, format = "png", scale = 2, name = "design", width, height, capture = {} }) {
  if (!el) throw new Error("Nothing to export");
  const w = Math.max(1, Math.round(width || el.offsetWidth || 1));
  const h = Math.max(1, Math.round(height || el.offsetHeight || 1));

  if (format === "pdf") {
    const png = await toRaster(el, "png", scale, capture);
    const pdf = new jsPDF({
      orientation: w >= h ? "landscape" : "portrait",
      unit: "px",
      format: [w, h],
      hotfixes: ["px_scaling"],
    });
    pdf.addImage(png, "PNG", 0, 0, w, h);
    pdf.save(`${name}.pdf`);
    return;
  }

  const dataUrl = await toRaster(el, format, scale, capture);
  triggerDownload(dataUrl, `${name}.${format === "jpeg" ? "jpg" : "png"}`);
}
