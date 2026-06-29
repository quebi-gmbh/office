/**
 * Stamp an image (PNG or JPG) on selected pages of an existing PDF. Same
 * 9-anchor positioning as the text watermark.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";
import type { Anchor } from "~/pdf/lib/watermark";

export type ImageStampOpts = {
  imageBytes: Uint8Array;
  /** "png" or "jpg" — auto-detected when omitted. */
  format?: "png" | "jpg";
  /** Stamp width in points. Height is derived from aspect ratio. */
  width: number;
  opacity: number;
  rotation: number;
  anchor: Anchor;
  inset: number;
  pages: number[] | null;
};

function detectFormat(bytes: Uint8Array): "png" | "jpg" {
  // PNG starts with 89 50 4E 47, JPEG with FF D8.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  // Default to PNG so embedding fails noisily instead of silently corrupting.
  return "png";
}

export async function stampImage(
  bytes: Uint8Array,
  opts: ImageStampOpts,
): Promise<Uint8Array> {
  const { degrees } = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  const fmt = opts.format ?? detectFormat(opts.imageBytes);
  const image = fmt === "png"
    ? await pdf.embedPng(opts.imageBytes)
    : await pdf.embedJpg(opts.imageBytes);

  const aspect = image.height / image.width;
  const w = opts.width;
  const h = w * aspect;
  const targetPages = opts.pages && opts.pages.length > 0
    ? new Set(opts.pages)
    : null;

  pdf.getPages().forEach((page, idx) => {
    if (targetPages && !targetPages.has(idx)) return;
    const { width, height } = page.getSize();
    let x = 0;
    let y = 0;
    switch (opts.anchor) {
      case "top-left":     x = opts.inset;                        y = height - opts.inset - h; break;
      case "top":          x = (width - w) / 2;                   y = height - opts.inset - h; break;
      case "top-right":    x = width - opts.inset - w;            y = height - opts.inset - h; break;
      case "left":         x = opts.inset;                        y = (height - h) / 2;        break;
      case "center":       x = (width - w) / 2;                   y = (height - h) / 2;        break;
      case "right":        x = width - opts.inset - w;            y = (height - h) / 2;        break;
      case "bottom-left":  x = opts.inset;                        y = opts.inset;              break;
      case "bottom":       x = (width - w) / 2;                   y = opts.inset;              break;
      case "bottom-right": x = width - opts.inset - w;            y = opts.inset;              break;
    }
    page.drawImage(image, {
      x,
      y,
      width: w,
      height: h,
      opacity: opts.opacity,
      rotate: degrees(opts.rotation),
    });
  });

  return savePdfDoc(pdf);
}
