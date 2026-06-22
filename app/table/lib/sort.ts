/**
 * Type-aware, multi-column sort. Sorting materialises a new row order (the doc
 * rows are physically reordered) so the grid, copy, and clear all keep working
 * on contiguous ranges. To hit the 100k-row budget we precompute one comparable
 * key array per sort column instead of parsing inside the comparator.
 */
import { type TableDoc, type ColumnType } from "./model";
import { type Locale, effectiveType, parseNumber, parseDate, parseBool } from "./coltypes";

export interface SortKey {
  col: number;
  dir: "asc" | "desc";
}

type KeyArray =
  | { kind: "num"; vals: Float64Array }
  | { kind: "str"; vals: string[] };

function buildKey(doc: TableDoc, col: number, type: ColumnType, locale: Locale, n: number): KeyArray {
  const c = doc.cols[col] ?? [];
  if (type === "number" || type === "integer" || type === "date" || type === "datetime" || type === "bool") {
    const vals = new Float64Array(n);
    for (let r = 0; r < n; r++) {
      const raw = (c[r] ?? "").trim();
      if (!raw) {
        vals[r] = Infinity; // empties sort last
        continue;
      }
      const v =
        type === "bool"
          ? (parseBool(raw) === null ? NaN : Number(parseBool(raw)))
          : type === "date" || type === "datetime"
            ? parseDate(raw, locale)
            : parseNumber(raw, locale);
      vals[r] = v === null || Number.isNaN(v as number) ? Infinity : (v as number);
    }
    return { kind: "num", vals };
  }
  const vals = new Array<string>(n);
  for (let r = 0; r < n; r++) vals[r] = (c[r] ?? "").toLowerCase();
  return { kind: "str", vals };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortDoc(doc: TableDoc, spec: SortKey[], locale: Locale): TableDoc {
  if (spec.length === 0) return doc;
  const start = doc.hasHeader ? 1 : 0;
  const n = doc.nRows;
  const types = spec.map((k) => effectiveType(doc, k.col, locale));
  const keys = spec.map((k, i) => buildKey(doc, k.col, types[i], locale, n));

  const order: number[] = [];
  for (let r = start; r < n; r++) order.push(r);

  order.sort((ra, rb) => {
    for (let i = 0; i < spec.length; i++) {
      const key = keys[i];
      let cmp: number;
      if (key.kind === "num") {
        const a = key.vals[ra];
        const b = key.vals[rb];
        cmp = a === b ? 0 : a < b ? -1 : 1;
      } else {
        cmp = collator.compare(key.vals[ra], key.vals[rb]);
      }
      if (cmp !== 0) return spec[i].dir === "asc" ? cmp : -cmp;
    }
    return ra - rb; // stable tiebreak
  });

  const perm = start === 1 ? [0, ...order] : order;
  const cols = doc.cols.map((col) => perm.map((r) => col[r] ?? ""));
  const rowHeights = doc.rowHeights
    ? perm.map((r) => doc.rowHeights![r] ?? null)
    : undefined;
  return { ...doc, cols, rowHeights };
}
