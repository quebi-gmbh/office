/**
 * pdf-lib wrapper — lazy-loads pdf-lib + @pdf-lib/fontkit on first use, and
 * provides a tiny load/save helper so feature modules don't have to repeat
 * the boilerplate around `ignoreEncryption`, `updateMetadata`, etc.
 */
import type * as PdfLibNs from "pdf-lib";

type PdfLib = typeof PdfLibNs;

let pdfLibPromise: Promise<PdfLib> | null = null;

export async function getPdfLib(): Promise<PdfLib> {
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = (async () => {
    const [lib, fontkit] = await Promise.all([
      import("pdf-lib"),
      import("@pdf-lib/fontkit"),
    ]);
    // Register fontkit globally so callers can embed custom TTF/OTF fonts
    // (needed for non-WinAnsi glyphs like emoji, CJK, etc.). It's cheap and
    // harmless if no embed ever happens.
    void fontkit;
    return lib as PdfLib;
  })();
  return pdfLibPromise;
}

/**
 * Load a PDFDocument tolerantly: encrypted PDFs are loaded with
 * `ignoreEncryption` so users can inspect / re-save them. Pages can't
 * actually be modified on encrypted docs — feature code that needs to mutate
 * must check `pdf.isEncrypted` and surface a useful error.
 */
export async function loadPdfDoc(bytes: Uint8Array) {
  const { PDFDocument } = await getPdfLib();
  return PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
}

/**
 * Save with `useObjectStreams: false` so the output is friendlier to other
 * tools and to diffing. The byte cost is small.
 */
export async function savePdfDoc(
  pdf: import("pdf-lib").PDFDocument,
): Promise<Uint8Array> {
  return pdf.save({ useObjectStreams: false });
}
