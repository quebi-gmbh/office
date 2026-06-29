/**
 * Merge N PDFs (or N (pdf, pageSubset) tuples) into one.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

export type MergeInput = {
  bytes: Uint8Array;
  /** Optional subset of 0-based page indices. Omit / null → all pages. */
  pages?: number[] | null;
};

export async function mergePdfs(inputs: MergeInput[]): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const out = await PDFDocument.create();
  for (const input of inputs) {
    const src = await loadPdfDoc(input.bytes);
    const indices = input.pages && input.pages.length > 0
      ? input.pages
      : src.getPageIndices();
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
  }
  return savePdfDoc(out);
}
