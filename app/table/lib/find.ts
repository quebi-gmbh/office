/**
 * Find & replace over the table model. Pure functions so they're cheap to test
 * and fast: a full sweep over a 10k-row sheet is a few hundred-k string ops.
 */
import type { TableDoc, CellPos } from "./model";
import type { Rect } from "./selection";

export interface FindOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeCell: boolean;
  scope: "sheet" | "selection";
  rect?: Rect;
}

/** Build a matcher for a single cell value. Returns null on a bad regex. */
function makeMatcher(
  query: string,
  opts: FindOptions,
): ((value: string) => boolean) | null {
  if (opts.regex) {
    let re: RegExp;
    try {
      re = new RegExp(
        opts.wholeCell ? `^(?:${query})$` : query,
        opts.caseSensitive ? "" : "i",
      );
    } catch {
      return null;
    }
    return (v) => re.test(v);
  }
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  return (v) => {
    const hay = opts.caseSensitive ? v : v.toLowerCase();
    return opts.wholeCell ? hay === needle : hay.includes(needle);
  };
}

function bounds(doc: TableDoc, opts: FindOptions): Rect {
  if (opts.scope === "selection" && opts.rect) {
    return {
      r0: Math.max(0, opts.rect.r0),
      c0: Math.max(0, opts.rect.c0),
      r1: Math.min(doc.nRows - 1, opts.rect.r1),
      c1: Math.min(doc.nCols - 1, opts.rect.c1),
    };
  }
  return { r0: 0, c0: 0, r1: doc.nRows - 1, c1: doc.nCols - 1 };
}

/** All matching cells, in row-major order. */
export function findMatches(
  doc: TableDoc,
  query: string,
  opts: FindOptions,
): CellPos[] {
  if (!query) return [];
  const match = makeMatcher(query, opts);
  if (!match) return [];
  const b = bounds(doc, opts);
  const out: CellPos[] = [];
  for (let r = b.r0; r <= b.r1; r++) {
    for (let c = b.c0; c <= b.c1; c++) {
      if (match(doc.cols[c]?.[r] ?? "")) out.push({ r, c });
    }
  }
  return out;
}

/** Replace within a single cell's value (used for one-at-a-time replace). */
export function replaceInValue(
  value: string,
  query: string,
  replacement: string,
  opts: FindOptions,
): string {
  if (opts.regex) {
    try {
      const re = new RegExp(
        opts.wholeCell ? `^(?:${query})$` : query,
        opts.caseSensitive ? "g" : "gi",
      );
      return value.replace(re, replacement);
    } catch {
      return value;
    }
  }
  if (opts.wholeCell) {
    const eq = opts.caseSensitive ? value === query : value.toLowerCase() === query.toLowerCase();
    return eq ? replacement : value;
  }
  if (opts.caseSensitive) return value.split(query).join(replacement);
  // Case-insensitive plain replace.
  const re = new RegExp(escapeRegExp(query), "gi");
  return value.replace(re, replacement);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace across the whole scope in one pass. Returns the new doc + count. */
export function replaceAll(
  doc: TableDoc,
  query: string,
  replacement: string,
  opts: FindOptions,
): { doc: TableDoc; count: number } {
  if (!query) return { doc, count: 0 };
  const match = makeMatcher(query, opts);
  if (!match) return { doc, count: 0 };
  const b = bounds(doc, opts);
  let count = 0;
  const cols = doc.cols.slice();
  for (let c = b.c0; c <= b.c1; c++) {
    let touched = false;
    const col = (cols[c] ?? []).slice();
    for (let r = b.r0; r <= b.r1; r++) {
      const v = col[r] ?? "";
      if (match(v)) {
        const nv = replaceInValue(v, query, replacement, opts);
        if (nv !== v) {
          col[r] = nv;
          touched = true;
        }
        count++;
      }
    }
    if (touched) cols[c] = col;
  }
  return { doc: count ? { ...doc, cols } : doc, count };
}
