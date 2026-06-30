/**
 * pdfjs-dist wrapper — lazy-loads pdfjs the first time we need it (rendering
 * thumbnails / previews, extracting text). Both calls go through `getPdfjs`,
 * which sets up `GlobalWorkerOptions.workerSrc` once.
 *
 * The worker is emitted as a fixed-name asset by scripts/build.ts so we can
 * point at `/assets/pdf-worker.js` without dynamic URL rewriting.
 */
import type * as PdfJsNs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
// Side-effect import: installs Map/WeakMap.prototype.getOrInsertComputed before
// pdfjs-dist is evaluated. pdfjs v6 calls those methods unconditionally and
// throws "this[#$].getOrInsertComputed is not a function" on browsers that
// haven't shipped the TC39 Upsert proposal yet.
import "./polyfills";

type PdfJs = typeof PdfJsNs;

let pdfjsPromise: Promise<PdfJs> | null = null;

export async function getPdfjs(): Promise<PdfJs> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const mod = await import("pdfjs-dist");
    // The worker lives at a fixed path emitted by scripts/build.ts.
    // In dev, scripts/dev.ts also writes the same file.
    mod.GlobalWorkerOptions.workerSrc = "/assets/pdf-worker.js";
    return mod as unknown as PdfJs;
  })();
  return pdfjsPromise;
}

/**
 * Load a PDF document via pdfjs. pdfjs takes ownership of the buffer once we
 * pass it in (it transfers / reads from it on the worker thread), so callers
 * should pass a *copy* if they still want to use the bytes themselves.
 */
export async function loadPdfJsDoc(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  // pdfjs ≥ 4 detaches the buffer; clone defensively.
  const copy = bytes.slice();
  const task = pdfjs.getDocument({
    data: copy,
    disableAutoFetch: true,
    disableStream: true,
  });
  return task.promise;
}

/**
 * Render a single page to a canvas at the requested CSS width (px). Returns
 * the canvas; caller decides whether to mount or convert to a PNG dataURL.
 */
export async function renderPageToCanvas(
  page: PDFPageProxy,
  cssWidth: number,
  dpr = window.devicePixelRatio || 1,
): Promise<HTMLCanvasElement> {
  const viewport1 = page.getViewport({ scale: 1 });
  const scale = cssWidth / viewport1.width;
  const viewport = page.getViewport({ scale: scale * dpr });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssWidth * (viewport1.height / viewport1.width)}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  // pdfjs v4+: render() takes `canvas` instead of `canvasContext + viewport`
  // in newer signatures, but the older signature still works.
  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as unknown as Parameters<PDFPageProxy["render"]>[0]).promise;

  return canvas;
}

/**
 * Extract plain text for a page. Joins items in reading order with single
 * spaces; inserts newlines on Y jumps. Good enough for "copy as text", not for
 * layout-preserving extraction (PDFium would do that better).
 */
export async function extractPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let out = "";
  let lastY: number | null = null;
  for (const item of content.items) {
    const it = item as { str: string; transform?: number[]; hasEOL?: boolean };
    const y = it.transform ? it.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      out += "\n";
    } else if (out && !out.endsWith(" ") && !out.endsWith("\n")) {
      out += " ";
    }
    out += it.str;
    if (it.hasEOL) out += "\n";
    lastY = y;
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}
