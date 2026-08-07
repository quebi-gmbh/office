/**
 * Open-document store — keeps an in-memory list of PDFs the user has opened.
 * Each doc carries its canonical bytes, page count, and per-page selection.
 *
 * Operations replace `bytes` in place (immutable from React's POV — we always
 * return a new array of OpenDoc objects). Bumping `rev` invalidates the thumb
 * cache so renderings refresh.
 */
import { loadPdfDoc } from "~/pdf/io/pdflib";
import type { Annotation } from "~/pdf/lib/annotate";
import type { FieldDraft } from "~/pdf/lib/form-fields";

export type OpenDoc = {
  /** Stable per-session id (Math.random base36). */
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  /** Bumped each time `bytes` is replaced so thumbnail caches can invalidate. */
  rev: number;
  /** Whether the source PDF is encrypted (loaded with ignoreEncryption). */
  encrypted: boolean;
  /**
   * Password the user entered to decrypt the document for pdf.js rendering
   * (thumbnails, preview, text extraction). `undefined` until supplied. pdf-lib
   * loads with `ignoreEncryption` and never needs it; pdf.js does.
   */
  password?: string;
  /** 0-based page indices selected by the user. */
  selected: Set<number>;
  /**
   * Live annotation layer (Draw mode). Strokes/shapes live here across pages
   * until the user hits Apply, which burns them into `bytes`. Purely transient:
   * closing the doc discards anything unburned.
   */
  annots: Annotation[];
  /**
   * Live form-field layer (Form fields mode). Hand-placed and auto-detected
   * field drafts live here across pages until the user hits Apply, which
   * creates the real AcroForm widgets in `bytes`. Transient like `annots`:
   * closing the doc discards anything unapplied.
   */
  fields: FieldDraft[];
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function createDoc(name: string, bytes: Uint8Array): Promise<OpenDoc> {
  const pdf = await loadPdfDoc(bytes);
  return {
    id: genId(),
    name,
    bytes,
    pageCount: pdf.getPageCount(),
    rev: 0,
    encrypted: pdf.isEncrypted,
    selected: new Set<number>(),
    annots: [],
    fields: [],
  };
}

/**
 * Swap in freshly-produced bytes. Selection is dropped (it no longer maps
 * cleanly); the annotation and field layers are kept but clamped to the new
 * page count, unless `clearAnnots` / `clearFields` says the new bytes already
 * contain them.
 */
export async function replaceBytes(
  doc: OpenDoc,
  bytes: Uint8Array,
  opts: { clearAnnots?: boolean; clearFields?: boolean } = {},
): Promise<OpenDoc> {
  const pdf = await loadPdfDoc(bytes);
  const pageCount = pdf.getPageCount();
  return {
    ...doc,
    bytes,
    pageCount,
    rev: doc.rev + 1,
    encrypted: pdf.isEncrypted,
    selected: new Set<number>(), // selection no longer maps cleanly
    annots: opts.clearAnnots ? [] : doc.annots.filter((a) => a.page < pageCount),
    fields: opts.clearFields ? [] : doc.fields.filter((f) => f.page < pageCount),
  };
}

export function addAnnot(doc: OpenDoc, annot: Annotation): OpenDoc {
  return { ...doc, annots: [...doc.annots, annot] };
}

export function removeAnnots(doc: OpenDoc, ids: string[]): OpenDoc {
  if (ids.length === 0) return doc;
  const drop = new Set(ids);
  const next = doc.annots.filter((a) => !drop.has(a.id));
  return next.length === doc.annots.length ? doc : { ...doc, annots: next };
}

export function setAnnots(doc: OpenDoc, annots: Annotation[]): OpenDoc {
  return { ...doc, annots };
}

export function setFields(doc: OpenDoc, fields: FieldDraft[]): OpenDoc {
  return { ...doc, fields };
}

/** Anything unapplied that would be lost by closing the document. */
export function pendingEdits(doc: OpenDoc): number {
  return doc.annots.length + doc.fields.length;
}

/**
 * Attach (or update) the password used to decrypt this doc for rendering.
 * Bumps `rev` so the thumbnail / preview caches drop their stale (failed)
 * renders and re-run with the new password.
 */
export function setPassword(doc: OpenDoc, password: string): OpenDoc {
  return { ...doc, password, rev: doc.rev + 1 };
}

export function toggleSelected(doc: OpenDoc, page: number): OpenDoc {
  const next = new Set(doc.selected);
  if (next.has(page)) next.delete(page);
  else next.add(page);
  return { ...doc, selected: next };
}

export function setSelection(doc: OpenDoc, pages: number[]): OpenDoc {
  return { ...doc, selected: new Set(pages) };
}

export function selectAll(doc: OpenDoc): OpenDoc {
  const all = new Set<number>();
  for (let i = 0; i < doc.pageCount; i++) all.add(i);
  return { ...doc, selected: all };
}

export function clearSelection(doc: OpenDoc): OpenDoc {
  return { ...doc, selected: new Set<number>() };
}

export function selectedSorted(doc: OpenDoc): number[] {
  return Array.from(doc.selected).sort((a, b) => a - b);
}
