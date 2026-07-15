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

async function toRaster(el, format, scale, extra) {
  // skipFonts: html-to-image otherwise tries to inline every stylesheet's
  // @font-face — including the cross-origin Google Fonts sheets — which throws
  // SecurityErrors and re-fetches on every export. Skipping it makes exports
  // fast and error-free; text falls back to the system sans (≈ Inter).
  const opts = { pixelRatio: scale, cacheBust: true, skipFonts: true, ...extra };
  if (format === "jpeg") {
    return htmlToImage.toJpeg(el, {
      ...opts,
      quality: 0.95,
      backgroundColor: (extra && extra.backgroundColor) || "#ffffff",
    });
  }
  return htmlToImage.toPng(el, opts);
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
