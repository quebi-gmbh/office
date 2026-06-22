/**
 * Table data model — the column-major store at the heart of `/table`.
 *
 * Storage is column-major: `cols[c][r]` holds the raw string value of the cell
 * in column `c`, row `r`. Column-major makes the column-wide operations that a
 * spreadsheet leans on (type inference, sort, filter, summary stats) cheap and
 * cache-friendly, at the cost of slightly pricier row insert/delete (handled in
 * phase 1.3).
 *
 * The conceptual cell shape is `{ value: string; type?: ColumnType }`. We keep
 * the *value* dense in `cols` and the *type* per-column in `colTypes` (filled in
 * by phase 1.4) rather than boxing every cell into an object — that keeps a
 * 100k-row sheet to a handful of large arrays instead of millions of objects.
 *
 * All mutators are pure: they return a new `TableDoc` that structurally shares
 * every untouched column with the previous doc, so undo/redo can keep a stack
 * of doc references cheaply (≈ one column copy per edit).
 */

export type ColumnType =
  | "text"
  | "number"
  | "integer"
  | "date"
  | "datetime"
  | "bool";

export interface TableDoc {
  version: 1;
  name: string;
  nRows: number;
  nCols: number;
  /** Column-major values: cols[c][r]. Ragged columns are allowed; a missing
   *  entry is treated as "". */
  cols: string[][];
  /** Per-column type override; null = auto/untyped (resolved in phase 1.4). */
  colTypes: (ColumnType | null)[];
  /** Per-column width in px; null = default width. */
  colWidths: (number | null)[];
  /** Per-row height in px; null/absent = default ROW_HEIGHT. Sparse: only
   *  resized rows need an entry. */
  rowHeights?: (number | null)[];
  /** Whether row 0 holds column labels (used by type inference + export). */
  hasHeader?: boolean;
}

export interface CellPos {
  r: number;
  c: number;
}

export const DEFAULT_ROWS = 100;
export const DEFAULT_COLS = 26;
export const DEFAULT_COL_WIDTH = 110;
export const ROW_HEIGHT = 28;
export const HEADER_HEIGHT = 28;
export const ROW_HEADER_WIDTH = 52;

// ── Construction ──────────────────────────────────────────────────────────────

export function createEmptyDoc(
  nRows = DEFAULT_ROWS,
  nCols = DEFAULT_COLS,
  name = "Untitled",
): TableDoc {
  return {
    version: 1,
    name,
    nRows,
    nCols,
    cols: Array.from({ length: nCols }, () => []),
    colTypes: Array.from({ length: nCols }, () => null),
    colWidths: Array.from({ length: nCols }, () => null),
  };
}

/** Build a doc from a row-major 2-D array of strings (e.g. a parsed CSV). */
export function docFromRows(
  rows: string[][],
  name = "Untitled",
  hasHeader = false,
): TableDoc {
  const nRows = rows.length;
  const nCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols: string[][] = Array.from({ length: nCols }, () => new Array(nRows));
  for (let r = 0; r < nRows; r++) {
    const row = rows[r];
    for (let c = 0; c < nCols; c++) cols[c][r] = row[c] ?? "";
  }
  return {
    version: 1,
    name,
    nRows: Math.max(nRows, 1),
    nCols: Math.max(nCols, 1),
    cols,
    colTypes: Array.from({ length: Math.max(nCols, 1) }, () => null),
    colWidths: Array.from({ length: Math.max(nCols, 1) }, () => null),
    hasHeader,
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getCell(doc: TableDoc, r: number, c: number): string {
  return doc.cols[c]?.[r] ?? "";
}

export function colWidth(doc: TableDoc, c: number): number {
  return doc.colWidths[c] ?? DEFAULT_COL_WIDTH;
}

/** Export the doc to a dense row-major matrix (used by export / clipboard). */
export function toRows(doc: TableDoc): string[][] {
  const rows: string[][] = [];
  for (let r = 0; r < doc.nRows; r++) {
    const row = new Array<string>(doc.nCols);
    for (let c = 0; c < doc.nCols; c++) row[c] = getCell(doc, r, c);
    rows.push(row);
  }
  return rows;
}

// ── Mutators (pure; structural sharing per column) ─────────────────────────────

export function setCell(
  doc: TableDoc,
  r: number,
  c: number,
  value: string,
): TableDoc {
  const grown = ensureSize(doc, r + 1, c + 1);
  const cols = grown.cols.slice();
  const col = (cols[c] ?? []).slice();
  while (col.length <= r) col.push("");
  if (col[r] === value) return doc;
  col[r] = value;
  cols[c] = col;
  return { ...grown, cols };
}

/**
 * Write a rectangular block of values with the top-left corner at (r0, c0).
 * Grows the doc as needed. Used by paste and fill operations in later phases.
 */
export function setBlock(
  doc: TableDoc,
  r0: number,
  c0: number,
  block: string[][],
): TableDoc {
  const h = block.length;
  const w = block.reduce((m, row) => Math.max(m, row.length), 0);
  let next = ensureSize(doc, r0 + h, c0 + w);
  const cols = next.cols.slice();
  for (let dc = 0; dc < w; dc++) {
    const c = c0 + dc;
    const col = (cols[c] ?? []).slice();
    while (col.length < r0 + h) col.push("");
    for (let dr = 0; dr < h; dr++) col[r0 + dr] = block[dr][dc] ?? "";
    cols[c] = col;
  }
  return { ...next, cols };
}

/** Clear every cell inside the inclusive rectangle. */
export function clearRange(
  doc: TableDoc,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): TableDoc {
  const cols = doc.cols.slice();
  for (let c = c0; c <= c1 && c < doc.nCols; c++) {
    const col = (cols[c] ?? []).slice();
    for (let r = r0; r <= r1 && r < col.length; r++) col[r] = "";
    cols[c] = col;
  }
  return { ...doc, cols };
}

export function setColWidth(doc: TableDoc, c: number, width: number): TableDoc {
  const colWidths = doc.colWidths.slice();
  colWidths[c] = Math.max(40, Math.round(width));
  return { ...doc, colWidths };
}

export function rowHeight(doc: TableDoc, r: number): number {
  return doc.rowHeights?.[r] ?? ROW_HEIGHT;
}

export function setRowHeight(doc: TableDoc, r: number, height: number): TableDoc {
  const rowHeights = (doc.rowHeights ?? []).slice();
  rowHeights[r] = Math.max(18, Math.round(height));
  return { ...doc, rowHeights };
}

// ── Structural ops (insert / delete rows & columns) ───────────────────────────

/** Insert `count` blank rows before index `at` (clamped to [0, nRows]). */
export function insertRows(doc: TableDoc, at: number, count = 1): TableDoc {
  const a = Math.max(0, Math.min(at, doc.nRows));
  const blanks = () => Array.from({ length: count }, () => "");
  const cols = doc.cols.map((col) => {
    const c = col.slice();
    while (c.length < a) c.push("");
    c.splice(a, 0, ...blanks());
    return c;
  });
  const rowHeights = doc.rowHeights
    ? insertInto(doc.rowHeights, a, count, null)
    : undefined;
  return { ...doc, cols, nRows: doc.nRows + count, rowHeights };
}

/** Delete `count` rows starting at index `at`. Keeps at least one row. */
export function deleteRows(doc: TableDoc, at: number, count = 1): TableDoc {
  const a = Math.max(0, Math.min(at, doc.nRows - 1));
  const n = Math.min(count, doc.nRows - a);
  if (doc.nRows - n < 1) return clearAllRows(doc); // never go to zero rows
  const cols = doc.cols.map((col) => {
    const c = col.slice();
    c.splice(a, n);
    return c;
  });
  const rowHeights = doc.rowHeights
    ? doc.rowHeights.slice(0, a).concat(doc.rowHeights.slice(a + n))
    : undefined;
  return { ...doc, cols, nRows: doc.nRows - n, rowHeights };
}

function clearAllRows(doc: TableDoc): TableDoc {
  return {
    ...doc,
    nRows: 1,
    cols: doc.cols.map(() => [""]),
    rowHeights: undefined,
  };
}

/** Insert `count` blank columns before index `at`. */
export function insertCols(doc: TableDoc, at: number, count = 1): TableDoc {
  const a = Math.max(0, Math.min(at, doc.nCols));
  const newCols = Array.from({ length: count }, () => [] as string[]);
  const cols = doc.cols.slice();
  cols.splice(a, 0, ...newCols);
  const colTypes = insertInto(doc.colTypes, a, count, null);
  const colWidths = insertInto(doc.colWidths, a, count, null);
  return { ...doc, cols, colTypes, colWidths, nCols: doc.nCols + count };
}

/** Delete `count` columns starting at index `at`. Keeps at least one column. */
export function deleteCols(doc: TableDoc, at: number, count = 1): TableDoc {
  const a = Math.max(0, Math.min(at, doc.nCols - 1));
  const n = Math.min(count, doc.nCols - a);
  if (doc.nCols - n < 1) {
    return { ...doc, nCols: 1, cols: [[]], colTypes: [null], colWidths: [null] };
  }
  const cols = doc.cols.slice();
  cols.splice(a, n);
  return {
    ...doc,
    cols,
    colTypes: doc.colTypes.slice(0, a).concat(doc.colTypes.slice(a + n)),
    colWidths: doc.colWidths.slice(0, a).concat(doc.colWidths.slice(a + n)),
    nCols: doc.nCols - n,
  };
}

function insertInto<T>(arr: T[], at: number, count: number, fill: T): T[] {
  const out = arr.slice();
  while (out.length < at) out.push(fill);
  out.splice(at, 0, ...Array.from({ length: count }, () => fill));
  return out;
}

/** Width that fits the longest value in a column (rough char-width estimate). */
export function autoColWidth(doc: TableDoc, c: number): number {
  let max = 0;
  const col = doc.cols[c] ?? [];
  for (let r = 0; r < doc.nRows; r++) {
    const len = (col[r] ?? "").length;
    if (len > max) max = len;
  }
  return Math.max(60, Math.min(480, max * 8 + 20));
}

/** Grow the doc (never shrinks) so it has at least minRows × minCols. */
export function ensureSize(
  doc: TableDoc,
  minRows: number,
  minCols: number,
): TableDoc {
  if (minRows <= doc.nRows && minCols <= doc.nCols) return doc;
  const nRows = Math.max(doc.nRows, minRows);
  const nCols = Math.max(doc.nCols, minCols);
  const cols = doc.cols.slice();
  const colTypes = doc.colTypes.slice();
  const colWidths = doc.colWidths.slice();
  for (let c = doc.nCols; c < nCols; c++) {
    cols[c] = [];
    colTypes[c] = null;
    colWidths[c] = null;
  }
  return { ...doc, nRows, nCols, cols, colTypes, colWidths };
}

export function isEmptyDoc(doc: TableDoc): boolean {
  return doc.cols.every((col) => col.every((v) => v === ""));
}

// ── Column / cell reference helpers (A1 notation) ──────────────────────────────

/** 0 → "A", 25 → "Z", 26 → "AA", … */
export function colToLabel(c: number): string {
  let s = "";
  let n = c;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** "A" → 0, "Z" → 25, "AA" → 26 */
export function labelToCol(label: string): number {
  let n = 0;
  for (const ch of label.toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Parse "B3" → { c: 1, r: 2 }; null if not an A1 reference. */
export function parseRef(ref: string): CellPos | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { c: labelToCol(m[1]), r: parseInt(m[2], 10) - 1 };
}
