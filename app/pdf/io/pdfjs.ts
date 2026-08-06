/**
 * pdfjs-dist wrapper — lazy-loads pdfjs the first time we need it (rendering
 * thumbnails / previews, extracting text). Both calls go through `getPdfjs`,
 * which sets up the worker once.
 *
 * The worker is a Vite `?worker` chunk (see pdfjs-worker import below); we hand
 * the instance to pdfjs via `GlobalWorkerOptions.workerPort`.
 */
import type * as PdfJsNs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
// Vite `?worker` import: bundles app/pdf/io/pdfjs-worker.ts (polyfills + the
// pdfjs worker) and gives us a Worker constructor. We hand the instance to
// pdfjs via GlobalWorkerOptions.workerPort below.
import PdfjsWorker from "./pdfjs-worker?worker";
// Side-effect import: installs Map/WeakMap.prototype.getOrInsertComputed before
// pdfjs-dist is evaluated. pdfjs v6 calls those methods unconditionally and
// throws "this[#$].getOrInsertComputed is not a function" on browsers that
// haven't shipped the TC39 Upsert proposal yet.
import "./polyfills";

type PdfJs = typeof PdfJsNs;

let pdfjsPromise: Promise<PdfJs> | null = null;

// Base URLs for pdfjs runtime assets (must end with a trailing slash — pdfjs
// concatenates the filename directly). scripts/prebuild.ts copies the matching
// directories from node_modules/pdfjs-dist into public/pdfjs/ (served at /pdfjs/).
//
// - WASM_URL: jbig2.wasm / openjpeg.wasm / qcms_bg.wasm. Without this, scanned
//   PDFs (JBIG2-compressed pages) fail to render with
//   "JBig2Error: JBig2 failed to initialize" because pdfjs falls back to
//   fetching `null` + filename.
// - CMAP_URL: predefined CMaps for CJK / non-Latin fonts.
// - STD_FONT_URL: replacement glyphs for the 14 standard PDF fonts when the
//   document doesn't embed them.
const WASM_URL = "/pdfjs/wasm/";
const CMAP_URL = "/pdfjs/cmaps/";
const STD_FONT_URL = "/pdfjs/standard_fonts/";

export async function getPdfjs(): Promise<PdfJs> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const mod = await import("pdfjs-dist");
    // Hand pdfjs a Vite-bundled worker instance (keeps the getOrInsertComputed
    // polyfill that pdfjs-worker.ts installs). Using workerPort rather than
    // workerSrc avoids any runtime URL/path assumptions.
    mod.GlobalWorkerOptions.workerPort = new PdfjsWorker();
    return mod as unknown as PdfJs;
  })();
  return pdfjsPromise;
}

/**
 * Kind of pdfjs `PasswordException`:
 * - `"need"`    — the document is encrypted and no (or an empty) password was
 *                 supplied (`PasswordResponses.NEED_PASSWORD`).
 * - `"incorrect"` — a password was supplied but it didn't decrypt the document
 *                 (`PasswordResponses.INCORRECT_PASSWORD`).
 */
export type PasswordErrorKind = "need" | "incorrect";

// pdfjs numeric codes on a PasswordException (PasswordResponses enum). These are
// stable across pdfjs versions: NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2.
const NEED_PASSWORD = 1;
const INCORRECT_PASSWORD = 2;

/**
 * Classify an error thrown by `loadPdfJsDoc` (or any pdfjs load). Returns the
 * password-error kind, or `null` if it isn't a `PasswordException`. Lets the UI
 * decide whether to prompt for a password (and whether to say "incorrect").
 */
export function passwordErrorKind(err: unknown): PasswordErrorKind | null {
  const e = err as { name?: string; code?: number } | null;
  if (!e || e.name !== "PasswordException") return null;
  return e.code === INCORRECT_PASSWORD ? "incorrect" : "need";
}

/**
 * Load a PDF document via pdfjs. pdfjs takes ownership of the buffer once we
 * pass it in (it transfers / reads from it on the worker thread), so callers
 * should pass a *copy* if they still want to use the bytes themselves.
 *
 * `password` decrypts encrypted documents so page content streams can be
 * rendered / text-extracted. Without it, encrypted PDFs reject the returned
 * promise with a `PasswordException` (see `passwordErrorKind`). pdf-lib is
 * loaded separately with `ignoreEncryption`, so the document metadata already
 * opened even when this render path can't.
 */
export async function loadPdfJsDoc(
  bytes: Uint8Array,
  password?: string,
): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  // pdfjs ≥ 4 detaches the buffer; clone defensively.
  const copy = bytes.slice();
  const task = pdfjs.getDocument({
    data: copy,
    password,
    disableAutoFetch: true,
    disableStream: true,
    wasmUrl: WASM_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STD_FONT_URL,
  });
  return task.promise;
}

// Re-export the codes for tests / diagnostics without exposing pdfjs internals.
export const PasswordResponseCodes = { NEED_PASSWORD, INCORRECT_PASSWORD } as const;

/**
 * Smoke-test that a freshly produced document actually parses.
 *
 * pdf-lib rewrites the *entire* file on save, and for some real-world source
 * documents the result is one pdf.js rejects ("Bad (uncompressed) XRef entry:
 * …" and friends). Silently replacing the user's open document with bytes like
 * that is the worst possible outcome — the damage is only noticed later, once
 * the original is gone. So operations that rewrite the document check the
 * output here first and keep the previous bytes when it doesn't hold up.
 *
 * Returns `null` when the document is readable, or the reader's error message.
 * Password errors are *not* treated as failures — an encrypted document that
 * needs a password is a different conversation.
 */
export async function firstPageParseError(
  bytes: Uint8Array,
  password?: string,
): Promise<string | null> {
  let doc: PDFDocumentProxy | null = null;
  try {
    doc = await loadPdfJsDoc(bytes, password);
    // Touching page 1's operator list forces the xref/object fetches that a
    // structural problem hides behind — pdf.js is lazy, so merely opening the
    // document proves very little.
    const page = await doc.getPage(1);
    await page.getOperatorList();
    return null;
  } catch (e) {
    if (passwordErrorKind(e)) return null;
    return (e as Error)?.message || String(e);
  } finally {
    try {
      await doc?.loadingTask.destroy();
    } catch {
      // Best effort — the document is being discarded either way.
    }
  }
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
