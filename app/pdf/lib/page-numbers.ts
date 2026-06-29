/**
 * Add page numbers to every page. Format placeholders:
 *   {n}      current page number (1-based)
 *   {total}  total page count
 *   {name}   filename (without .pdf)
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";
import type { Anchor } from "~/pdf/lib/watermark";

export type PageNumberOpts = {
  /** e.g. "Page {n} of {total}" or "{n}". */
  format: string;
  fontSize: number;
  /** "#rrggbb" */
  color: string;
  anchor: Anchor;
  inset: number;
  /** If null/empty → all pages. */
  pages: number[] | null;
  /** First number to use (default 1, lets you skip a cover page). */
  startAt: number;
  docName: string;
};

function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [0.2, 0.2, 0.2];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export async function addPageNumbers(
  bytes: Uint8Array,
  opts: PageNumberOpts,
): Promise<Uint8Array> {
  const { StandardFonts, rgb } = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const [r, g, b] = hexToRgb01(opts.color);
  const total = pdf.getPageCount();
  const targetPages = opts.pages && opts.pages.length > 0
    ? new Set(opts.pages)
    : null;
  const nameBase = opts.docName.replace(/\.pdf$/i, "");

  pdf.getPages().forEach((page, idx) => {
    if (targetPages && !targetPages.has(idx)) return;
    const num = opts.startAt + idx;
    const text = opts.format
      .replaceAll("{n}", String(num))
      .replaceAll("{total}", String(total))
      .replaceAll("{name}", nameBase);
    const { width, height } = page.getSize();
    const textW = font.widthOfTextAtSize(text, opts.fontSize);
    const textH = font.heightAtSize(opts.fontSize);
    let x = 0;
    let y = 0;
    switch (opts.anchor) {
      case "top-left":     x = opts.inset;                  y = height - opts.inset - textH; break;
      case "top":          x = (width - textW) / 2;         y = height - opts.inset - textH; break;
      case "top-right":    x = width - opts.inset - textW;  y = height - opts.inset - textH; break;
      case "left":         x = opts.inset;                  y = (height - textH) / 2;        break;
      case "center":       x = (width - textW) / 2;         y = (height - textH) / 2;        break;
      case "right":        x = width - opts.inset - textW;  y = (height - textH) / 2;        break;
      case "bottom-left":  x = opts.inset;                  y = opts.inset;                  break;
      case "bottom":       x = (width - textW) / 2;         y = opts.inset;                  break;
      case "bottom-right": x = width - opts.inset - textW;  y = opts.inset;                  break;
    }
    page.drawText(text, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(r, g, b),
    });
  });

  return savePdfDoc(pdf);
}
