/**
 * Crop selected pages by setting both MediaBox and CropBox.
 * Coordinates are in PDF user-space points, origin at the bottom-left of the
 * page. Values are clamped to the original MediaBox.
 */
import { loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

export type CropBox = { x: number; y: number; width: number; height: number };

export async function cropPages(
  bytes: Uint8Array,
  pages: number[],
  box: CropBox,
): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  const set = new Set(pages);
  pdf.getPages().forEach((page, idx) => {
    if (!set.has(idx)) return;
    const media = page.getMediaBox();
    const x = Math.max(media.x, box.x);
    const y = Math.max(media.y, box.y);
    const w = Math.min(box.width, media.width - (x - media.x));
    const h = Math.min(box.height, media.height - (y - media.y));
    page.setMediaBox(x, y, w, h);
    page.setCropBox(x, y, w, h);
  });
  return savePdfDoc(pdf);
}

/**
 * Reset crop & media box to the page's TrimBox or original size.
 * pdf-lib doesn't track "original" once we've mutated, so the caller should
 * supply the original bytes if they want to revert.
 */
