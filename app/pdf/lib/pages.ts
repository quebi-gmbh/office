/**
 * Page-level operations on a single PDF: rotate / delete / duplicate /
 * insert-blank / reorder / extract-selected.
 *
 * All ops take + return bytes so the caller stays oblivious to pdf-lib's
 * mutable document object.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

type Rotation = 90 | 180 | 270 | -90;

export async function rotatePages(
  bytes: Uint8Array,
  pages: number[],
  by: Rotation,
): Promise<Uint8Array> {
  const { degrees } = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  const set = new Set(pages);
  pdf.getPages().forEach((page, idx) => {
    if (!set.has(idx)) return;
    const current = page.getRotation().angle;
    const next = (((current + by) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  });
  return savePdfDoc(pdf);
}

export async function deletePages(
  bytes: Uint8Array,
  pages: number[],
): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  // Remove from highest to lowest so indices stay stable.
  [...pages].sort((a, b) => b - a).forEach((p) => {
    if (p >= 0 && p < pdf.getPageCount()) pdf.removePage(p);
  });
  return savePdfDoc(pdf);
}

export async function duplicatePages(
  bytes: Uint8Array,
  pages: number[],
): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  // Copy each selected page back into the same doc directly after itself.
  // Sort descending so insertion indices remain meaningful.
  const order = [...pages].sort((a, b) => b - a);
  for (const idx of order) {
    const [copy] = await pdf.copyPages(pdf, [idx]);
    pdf.insertPage(idx + 1, copy);
  }
  return savePdfDoc(pdf);
}

export async function insertBlankPage(
  bytes: Uint8Array,
  /** 0-based insertion index. `null` → append at end. */
  at: number | null,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  const page = pdf.insertPage(at ?? pdf.getPageCount(), [width, height]);
  void page;
  return savePdfDoc(pdf);
}

/**
 * Reorder pages by supplying a permutation: `order[i]` is the source page
 * index that should become page `i` in the output.
 */
export async function reorderPages(
  bytes: Uint8Array,
  order: number[],
): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const src = await loadPdfDoc(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, order);
  copied.forEach((p) => out.addPage(p));
  return savePdfDoc(out);
}

/**
 * Build a brand-new PDF containing only the selected pages, in the order
 * given. Selection order is preserved (so this also lets users reorder while
 * extracting).
 */
export async function extractPages(
  bytes: Uint8Array,
  pages: number[],
): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const src = await loadPdfDoc(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages);
  copied.forEach((p) => out.addPage(p));
  return savePdfDoc(out);
}

/**
 * Scale all selected pages' MediaBox to a target paper size (in points).
 * Content is not actually rescaled — only the page box is — which matches
 * what most "resize" features do.
 */
export async function setPageSize(
  bytes: Uint8Array,
  pages: number[],
  width: number,
  height: number,
): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  const set = new Set(pages);
  pdf.getPages().forEach((page, idx) => {
    if (!set.has(idx)) return;
    page.setSize(width, height);
  });
  return savePdfDoc(pdf);
}
