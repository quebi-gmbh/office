/**
 * LRU-ish cache for rendered page thumbnails. Keyed by
 * `${docId}:${rev}:${page}:${width}`. We store data URLs (PNG) so React
 * components can swap them into <img> tags with no extra wiring.
 *
 * Rendering a page is *expensive* (worker round-trip + canvas paint), so we
 * cache aggressively. The cache is global and shared across panels.
 */
import {
  loadPdfJsDoc,
  renderPageToCanvas,
  passwordErrorKind,
  type PasswordErrorKind,
} from "~/pdf/io/pdfjs";

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
  password?: string,
): Promise<import("pdfjs-dist").PDFDocumentProxy> {
  const k = `${docId}:${rev}`;
  const existing = docCache.get(k);
  if (existing) return existing;
  const p = loadPdfJsDoc(bytes, password);
  docCache.set(k, p);
  // Best-effort: when the rev changes, drop stale entries for this doc. The
  // extra `.catch` keeps a rejected load (e.g. wrong password) from surfacing
  // as an unhandled rejection — the real error still propagates to callers of
  // `p`.
  void p
    .then((doc) => {
      for (const cachedKey of docCache.keys()) {
        if (cachedKey.startsWith(`${docId}:`) && cachedKey !== k) {
          docCache.get(cachedKey)?.then((old) => old.loadingTask.destroy()).catch(() => {});
          docCache.delete(cachedKey);
        }
      }
      return doc;
    })
    .catch(() => {
      // Drop the failed promise so a later retry (new password, same rev) can
      // re-attempt the load instead of replaying the cached rejection.
      if (docCache.get(k) === p) docCache.delete(k);
    });
  return p;
}

/**
 * The cached pdfjs document for `(docId, rev)`, loading it if needed. Exposed
 * so other readers (field detection, text extraction) share the one parse the
 * thumbnail renderer already paid for.
 */
export function getSharedPdfJsDoc(
  docId: string,
  rev: number,
  bytes: Uint8Array,
  password?: string,
): Promise<import("pdfjs-dist").PDFDocumentProxy> {
  return getPdfJsDoc(docId, rev, bytes, password);
}

/**
 * Attempt to load the doc via pdfjs and report whether it needs a password.
 * Returns `null` when the document loads fine (unencrypted, or the supplied
 * password worked), or the `PasswordErrorKind` when pdfjs wants a password.
 * Re-throws any non-password error. Reuses the same cached loading task as the
 * thumbnail renderer, so this never triggers a second parse.
 */
export async function probePassword(
  docId: string,
  rev: number,
  bytes: Uint8Array,
  password?: string,
): Promise<PasswordErrorKind | null> {
  try {
    await getPdfJsDoc(docId, rev, bytes, password);
    return null;
  } catch (e) {
    const kind = passwordErrorKind(e);
    if (kind) return kind;
    throw e;
  }
}

export async function getThumbnail(
  docId: string,
  rev: number,
  bytes: Uint8Array,
  page: number,
  width: number,
  password?: string,
): Promise<string> {
  const k = key(docId, rev, page, width);
  const cached = cache.get(k);
  if (cached) return cached;
  const inflightP = inflight.get(k);
  if (inflightP) return inflightP;

  const p = (async () => {
    const pdf = await getPdfJsDoc(docId, rev, bytes, password);
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
