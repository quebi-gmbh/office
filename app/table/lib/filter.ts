/**
 * Per-column filtering. Filters are non-destructive: they produce a `view` — the
 * list of visible source-row indices, in order — which the grid renders through.
 * The header row (when present) is always visible.
 */
import { type TableDoc, type ColumnType, getCell } from "./model";
import { type Locale, effectiveType, parseNumber, parseDate } from "./coltypes";

export type FilterOp =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "between"
  | "empty"
  | "notEmpty";

export interface ColumnFilter {
  col: number;
  op: FilterOp;
  value: string;
  value2?: string;
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  between: "between",
  empty: "is empty",
  notEmpty: "is not empty",
};

function num(v: string, locale: Locale): number | null {
  return parseNumber(v, locale) ?? parseDate(v, locale);
}

function cellPasses(
  raw: string,
  f: ColumnFilter,
  type: ColumnType,
  locale: Locale,
): boolean {
  const v = raw.trim();
  switch (f.op) {
    case "empty":
      return v === "";
    case "notEmpty":
      return v !== "";
    case "contains":
      return v.toLowerCase().includes(f.value.trim().toLowerCase());
    case "eq":
    case "neq": {
      let eq: boolean;
      if (type === "number" || type === "integer" || type === "date" || type === "datetime") {
        const a = num(v, locale);
        const b = num(f.value, locale);
        eq = a !== null && b !== null ? a === b : v === f.value.trim();
      } else {
        eq = v.toLowerCase() === f.value.trim().toLowerCase();
      }
      return f.op === "eq" ? eq : !eq;
    }
    case "gt":
    case "lt":
    case "between": {
      const a = num(v, locale);
      const b = num(f.value, locale);
      if (a === null || b === null) return false;
      if (f.op === "gt") return a > b;
      if (f.op === "lt") return a < b;
      const b2 = num(f.value2 ?? "", locale);
      if (b2 === null) return false;
      const lo = Math.min(b, b2);
      const hi = Math.max(b, b2);
      return a >= lo && a <= hi;
    }
  }
}

export function rowPasses(
  doc: TableDoc,
  r: number,
  filters: ColumnFilter[],
  types: ColumnType[],
  locale: Locale,
): boolean {
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    if (!cellPasses(getCell(doc, r, f.col), f, types[i], locale)) return false;
  }
  return true;
}

/** Visible source-row indices in order. Returns null when no filters apply
 *  (the grid then uses the identity mapping and skips the work). */
export function computeView(
  doc: TableDoc,
  filters: ColumnFilter[],
  locale: Locale,
): number[] | null {
  if (filters.length === 0) return null;
  const types = filters.map((f) => effectiveType(doc, f.col, locale));
  const view: number[] = [];
  const start = doc.hasHeader ? 1 : 0;
  if (doc.hasHeader) view.push(0);
  for (let r = start; r < doc.nRows; r++) {
    if (rowPasses(doc, r, filters, types, locale)) view.push(r);
  }
  return view;
}
