/**
 * Stamp a text watermark on every (or selected) page. Supports rotation,
 * opacity, color, font size, and 9-anchor positioning.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

export type Anchor =
  | "top-left" | "top" | "top-right"
  | "left"    | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right";

export type WatermarkOpts = {
  text: string;
  fontSize: number;
  /** 0-1 */
  opacity: number;
  /** Degrees, counter-clockwise. Typical: 45 for diagonal. */
  rotation: number;
  /** Hex color "#rrggbb". */
  color: string;
  anchor: Anchor;
  /** Inset from page edges in points. */
  inset: number;
  /** If null/empty → all pages. */
  pages: number[] | null;
};

function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function anchorPoint(
  anchor: Anchor,
  pageW: number,
  pageH: number,
  textW: number,
  textH: number,
  inset: number,
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  switch (anchor) {
    case "top-left":     x = inset;                       y = pageH - inset - textH; break;
    case "top":          x = (pageW - textW) / 2;         y = pageH - inset - textH; break;
    case "top-right":    x = pageW - inset - textW;       y = pageH - inset - textH; break;
    case "left":         x = inset;                       y = (pageH - textH) / 2;   break;
    case "center":       x = (pageW - textW) / 2;         y = (pageH - textH) / 2;   break;
    case "right":        x = pageW - inset - textW;       y = (pageH - textH) / 2;   break;
    case "bottom-left":  x = inset;                       y = inset;                 break;
    case "bottom":       x = (pageW - textW) / 2;         y = inset;                 break;
    case "bottom-right": x = pageW - inset - textW;       y = inset;                 break;
  }
  return { x, y };
}

export async function addTextWatermark(
  bytes: Uint8Array,
  opts: WatermarkOpts,
): Promise<Uint8Array> {
  const { StandardFonts, rgb, degrees } = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [r, g, b] = hexToRgb01(opts.color);
  const targetPages = opts.pages && opts.pages.length > 0
    ? new Set(opts.pages)
    : null;
  const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);
  const textHeight = font.heightAtSize(opts.fontSize);

  pdf.getPages().forEach((page, idx) => {
    if (targetPages && !targetPages.has(idx)) return;
    const { width, height } = page.getSize();
    const { x, y } = anchorPoint(
      opts.anchor,
      width,
      height,
      textWidth,
      textHeight,
      opts.inset,
    );
    page.drawText(opts.text, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: opts.opacity,
      rotate: degrees(opts.rotation),
    });
  });

  return savePdfDoc(pdf);
}
