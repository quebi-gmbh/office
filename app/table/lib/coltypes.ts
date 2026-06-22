/**
 * Column type inference, locale-aware value parsing, comparison, and display
 * formatting for `/table`.
 *
 * Values are always stored as raw strings in the model; types and formats are
 * an interpretation layer applied for sorting, filtering, and display. Inference
 * samples the first N non-empty rows so it stays cheap on huge sheets.
 */
import type { ColumnType, TableDoc } from "./model";

export interface Locale {
  /** e.g. "en-US", "de-DE" */
  tag: string;
  decimal: string;
  group: string;
  /** Day-before-month when parsing ambiguous numeric dates. */
  dayFirst: boolean;
}

export type NumberStyle =
  | "auto"
  | "plain"
  | "thousands"
  | "percent"
  | "currency"
  | "scientific";

export interface ColFormat {
  style: NumberStyle;
  decimals: number | null;
  currency: string;
}

export const DEFAULT_FORMAT: ColFormat = { style: "auto", decimals: null, currency: "USD" };

// ── Locale ────────────────────────────────────────────────────────────────────

/** Derive decimal/group separators for a BCP-47 locale via Intl. */
export function localeFromTag(tag: string): Locale {
  let decimal = ".";
  let group = ",";
  try {
    const parts = new Intl.NumberFormat(tag).formatToParts(12345.6);
    decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
    group = parts.find((p) => p.type === "group")?.value ?? ",";
  } catch {
    /* keep defaults */
  }
  // Locales that write dates day-first (most of the world outside the US).
  const dayFirst = !/^(en-US|en-CA|fil|fr-CA)/i.test(tag);
  return { tag, decimal, group, dayFirst };
}

// ── Number parsing ────────────────────────────────────────────────────────────

/** Parse a locale-formatted numeric string → number, or null if not numeric. */
export function parseNumber(value: string, locale: Locale): number | null {
  const t = value.trim();
  if (!t) return null;
  let s = t.replace(/[\s ]/g, "");
  const percent = s.endsWith("%");
  if (percent) s = s.slice(0, -1);
  // Strip a leading/trailing currency symbol (anything non-numeric at edges).
  s = s.replace(/^[^\d+\-.,]+/, "").replace(/[^\d.,eE]+$/, "");
  // Remove group separators, normalise the decimal separator to ".".
  if (locale.group) s = s.split(locale.group).join("");
  if (locale.decimal !== ".") s = s.split(locale.decimal).join(".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return percent ? n / 100 : n;
}

const BOOL_TRUE = new Set(["true", "yes", "y", "1", "t"]);
const BOOL_FALSE = new Set(["false", "no", "n", "0", "f"]);

export function parseBool(value: string): boolean | null {
  const t = value.trim().toLowerCase();
  if (BOOL_TRUE.has(t)) return true;
  if (BOOL_FALSE.has(t)) return false;
  return null;
}

/** Parse a date string → epoch ms, or null. Handles ISO + DD/MM or MM/DD. */
export function parseDate(value: string, locale: Locale): number | null {
  const t = value.trim();
  if (!t) return null;
  // ISO 8601 (date or datetime).
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/.test(t)) {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  // Slash/dot/dash separated numeric date.
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})([ T](\d{1,2}):(\d{2})(:(\d{2}))?)?$/.exec(t);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let day: number, month: number;
    if (locale.dayFirst) {
      day = a;
      month = b;
    } else {
      month = a;
      day = b;
    }
    // If one field is clearly out of range as a month, swap.
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const hh = m[5] ? parseInt(m[5], 10) : 0;
    const mm = m[6] ? parseInt(m[6], 10) : 0;
    const ss = m[8] ? parseInt(m[8], 10) : 0;
    return new Date(year, month - 1, day, hh, mm, ss).getTime();
  }
  return null;
}

function hasTime(value: string): boolean {
  return /\d{1,2}:\d{2}/.test(value);
}

// ── Inference ─────────────────────────────────────────────────────────────────

const SAMPLE = 500;

/** Infer a column's type from a sample of its non-empty values. */
export function inferColumnType(
  doc: TableDoc,
  c: number,
  locale: Locale,
): ColumnType {
  const col = doc.cols[c] ?? [];
  const start = doc.hasHeader ? 1 : 0;
  let seen = 0;
  let nums = 0;
  let ints = 0;
  let bools = 0;
  let dates = 0;
  let datetimes = 0;
  for (let r = start; r < doc.nRows && seen < SAMPLE; r++) {
    const v = (col[r] ?? "").trim();
    if (!v) continue;
    seen++;
    const n = parseNumber(v, locale);
    if (n !== null) {
      nums++;
      if (Number.isInteger(n) && !/[.,eE]/.test(v.replace(/%$/, ""))) ints++;
      continue;
    }
    if (parseBool(v) !== null) {
      bools++;
      continue;
    }
    const d = parseDate(v, locale);
    if (d !== null) {
      dates++;
      if (hasTime(v)) datetimes++;
      continue;
    }
  }
  if (seen === 0) return "text";
  const frac = (n: number) => n / seen;
  if (frac(nums) >= 0.9) return ints === nums ? "integer" : "number";
  if (frac(bools) >= 0.9) return "bool";
  if (frac(dates) >= 0.9) return datetimes > dates / 2 ? "datetime" : "date";
  return "text";
}

/** Effective type: manual override, else inferred. */
export function effectiveType(
  doc: TableDoc,
  c: number,
  locale: Locale,
): ColumnType {
  return doc.colTypes[c] ?? inferColumnType(doc, c, locale);
}

// ── Comparison (type-aware) ───────────────────────────────────────────────────

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Compare two raw cell strings under a column type. Empty sorts last. */
export function compareValues(
  a: string,
  b: string,
  type: ColumnType,
  locale: Locale,
): number {
  const ae = a.trim() === "";
  const be = b.trim() === "";
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;
  if (type === "number" || type === "integer") {
    const na = parseNumber(a, locale);
    const nb = parseNumber(b, locale);
    if (na !== null && nb !== null) return na - nb;
  } else if (type === "date" || type === "datetime") {
    const da = parseDate(a, locale);
    const db = parseDate(b, locale);
    if (da !== null && db !== null) return da - db;
  } else if (type === "bool") {
    const ba = parseBool(a);
    const bb = parseBool(b);
    if (ba !== null && bb !== null) return Number(ba) - Number(bb);
  }
  return collator.compare(a, b);
}

// ── Display formatting ────────────────────────────────────────────────────────

/** Format a raw value for display per its column type + format + locale. */
export function formatValue(
  value: string,
  type: ColumnType,
  fmt: ColFormat,
  locale: Locale,
): string {
  if (value.trim() === "") return "";
  if (type === "number" || type === "integer") {
    const n = parseNumber(value, locale);
    if (n === null) return value;
    return formatNumber(n, type, fmt, locale);
  }
  return value;
}

function formatNumber(n: number, type: ColumnType, fmt: ColFormat, locale: Locale): string {
  const decimals = fmt.decimals;
  const opts: Intl.NumberFormatOptions = {};
  const style = fmt.style;
  if (style === "scientific") {
    return n.toExponential(decimals ?? undefined);
  }
  if (style === "percent") {
    opts.style = "percent";
  } else if (style === "currency") {
    opts.style = "currency";
    opts.currency = fmt.currency || "USD";
  } else if (style === "plain") {
    opts.useGrouping = false;
  } else if (style === "thousands") {
    opts.useGrouping = true;
  }
  // "auto": grouping for plain numbers, none for integers under 5 digits.
  if (style === "auto") {
    opts.useGrouping = type === "number" || Math.abs(n) >= 10000;
  }
  if (decimals != null) {
    opts.minimumFractionDigits = decimals;
    opts.maximumFractionDigits = decimals;
  }
  try {
    return new Intl.NumberFormat(locale.tag, opts).format(n);
  } catch {
    return String(n);
  }
}

/** Whether a type should be right-aligned in the grid. */
export function isNumericType(type: ColumnType): boolean {
  return type === "number" || type === "integer";
}

export const TYPE_LABELS: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  integer: "Integer",
  date: "Date",
  datetime: "Date & time",
  bool: "Boolean",
};
