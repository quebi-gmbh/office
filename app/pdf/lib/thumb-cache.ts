/**
 * LRU-ish cache for rendered page thumbnails. Keyed by
 * `${docId}:${rev}:${page}:${width}`. We store data URLs (PNG) so React
 * components can swap them into <img> tags with no extra wiring.
 *
 * Rendering a page is *expensive* (worker round-trip + canvas paint), so we
 * cache aggressively. The cache is global and shared across panels.
 */
import { loadPdfJsDoc, renderPageToCanvas } from "~/pdf/io/pdfjs";

const MAX_ENTRIES = 400;
const cache = new Map<string, string>(); // key -> dataURL
const inflight = new Map<string, Promise<string>>();

// One pdfjs doc per (docId, rev) so we don't reparse on every page render.
const docCache = new Map<string, Promise<import("pdfjs-dist").PDFDocumentProxy>>();

function key(docId: string, rev: number, page: number, width: number): string {
  return `${docId}:${rev}:${page}:${width}`;
}

function trim(): void {
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

async function getPdfJsDoc(
  docId: string,
  rev: number,
  bytes: Uint8Array,
): Promise<import("pdfjs-dist").PDFDocumentProxy> {
  const k = `${docId}:${rev}`;
  const existing = docCache.get(k);
  if (existing) return existing;
  const p = loadPdfJsDoc(bytes);
  docCache.set(k, p);
  // Best-effort: when the rev changes, drop stale entries for this doc.
  void p.then((doc) => {
    for (const cachedKey of docCache.keys()) {
      if (cachedKey.startsWith(`${docId}:`) && cachedKey !== k) {
        docCache.get(cachedKey)?.then((old) => old.loadingTask.destroy()).catch(() => {});
        docCache.delete(cachedKey);
      }
    }
    return doc;
  });
  return p;
}

export async function getThumbnail(
  docId: string,
  rev: number,
  bytes: Uint8Array,
  page: number,
  width: number,
): Promise<string> {
  const k = key(docId, rev, page, width);
  const cached = cache.get(k);
  if (cached) return cached;
  const inflightP = inflight.get(k);
  if (inflightP) return inflightP;

  const p = (async () => {
    const pdf = await getPdfJsDoc(docId, rev, bytes);
    const pdfPage = await pdf.getPage(page + 1);
    const canvas = await renderPageToCanvas(pdfPage, width);
    const dataUrl = canvas.toDataURL("image/png");
    cache.set(k, dataUrl);
    trim();
    inflight.delete(k);
    return dataUrl;
  })().catch((e) => {
    inflight.delete(k);
    throw e;
  });

  inflight.set(k, p);
  return p;
}

export function invalidateDoc(docId: string): void {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${docId}:`)) cache.delete(k);
  }
  for (const k of Array.from(docCache.keys())) {
    if (k.startsWith(`${docId}:`)) {
      docCache.get(k)?.then((d) => d.loadingTask.destroy()).catch(() => {});
      docCache.delete(k);
    }
  }
}
