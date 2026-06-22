/**
 * Export `/table` to any reasonable target — the symmetric "Download as…" /
 * "Copy as…" menus.
 *
 * Data/code targets (CSV, TSV, JSON, JSONL, SQL, Python, NumPy, MATLAB, C) emit
 * numbers as bare numeric literals and booleans as booleans, so the output is
 * directly parseable/executable in its host. Display targets (Markdown, HTML,
 * LaTeX) use the column's configured number format + locale. XLSX is written via
 * SheetJS (dynamic import) and is download-only.
 */
import { type TableDoc, type ColumnType, getCell, colToLabel } from "~/table/lib/model";
import {
  type ColFormat,
  type Locale,
  parseNumber,
  parseBool,
  formatValue,
  DEFAULT_FORMAT,
} from "~/table/lib/coltypes";

export interface ExportCtx {
  doc: TableDoc;
  types: ColumnType[];
  formats: (ColFormat | null)[];
  locale: Locale;
}

export interface ExportTarget {
  id: string;
  label: string;
  ext: string;
  mime: string;
  /** Binary targets (xlsx) provide toBlob and are download-only. */
  binary?: boolean;
  toText?: (ctx: ExportCtx) => string;
  toBlob?: (ctx: ExportCtx) => Promise<Blob>;
}

// ── Typed cell classification ──────────────────────────────────────────────────

type Typed =
  | { t: "num"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "str"; v: string }
  | { t: "empty" };

function classify(raw: string, type: ColumnType, locale: Locale): Typed {
  if (raw.trim() === "") return { t: "empty" };
  if (type === "number" || type === "integer") {
    const n = parseNumber(raw, locale);
    if (n !== null) return { t: "num", v: n };
  } else if (type === "bool") {
    const b = parseBool(raw);
    if (b !== null) return { t: "bool", v: b };
  }
  return { t: "str", v: raw };
}

function headerLabels(ctx: ExportCtx): string[] {
  const { doc } = ctx;
  if (doc.hasHeader) return Array.from({ length: doc.nCols }, (_, c) => getCell(doc, 0, c) || colToLabel(c));
  return Array.from({ length: doc.nCols }, (_, c) => colToLabel(c));
}

function dataRowRange(doc: TableDoc): [number, number] {
  return [doc.hasHeader ? 1 : 0, doc.nRows];
}

/** Row-major raw values (all rows, all cols). */
function rawRows(doc: TableDoc): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < doc.nRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < doc.nCols; c++) row.push(getCell(doc, r, c));
    out.push(row);
  }
  return out;
}

// ── Delimited ──────────────────────────────────────────────────────────────────

function delimited(rows: string[][], delim: string): string {
  const q = (v: string) =>
    new RegExp(`[${delim === "\t" ? "\\t" : delim}\\n\\r"]`).test(v)
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  return rows.map((r) => r.map(q).join(delim)).join("\r\n");
}

// ── JSON / JSONL ────────────────────────────────────────────────────────────────

function jsonValue(raw: string, type: ColumnType, locale: Locale): unknown {
  const t = classify(raw, type, locale);
  switch (t.t) {
    case "num": return t.v;
    case "bool": return t.v;
    case "empty": return null;
    default: return t.v;
  }
}

function rowsAsObjects(ctx: ExportCtx): Record<string, unknown>[] {
  const { doc, types, locale } = ctx;
  const keys = headerLabels(ctx);
  const [r0, r1] = dataRowRange(doc);
  const out: Record<string, unknown>[] = [];
  for (let r = r0; r < r1; r++) {
    const o: Record<string, unknown> = {};
    for (let c = 0; c < doc.nCols; c++) o[keys[c]] = jsonValue(getCell(doc, r, c), types[c], locale);
    out.push(o);
  }
  return out;
}

function rowsAsArrays(ctx: ExportCtx, includeHeader: boolean): unknown[][] {
  const { doc, types, locale } = ctx;
  const [r0, r1] = dataRowRange(doc);
  const out: unknown[][] = [];
  if (includeHeader && doc.hasHeader) out.push(headerLabels(ctx));
  for (let r = r0; r < r1; r++) {
    const row: unknown[] = [];
    for (let c = 0; c < doc.nCols; c++) row.push(jsonValue(getCell(doc, r, c), types[c], locale));
    out.push(row);
  }
  return out;
}

// ── Display (markdown / html / latex) ────────────────────────────────────────────

function displayRows(ctx: ExportCtx): string[][] {
  const { doc, types, formats, locale } = ctx;
  const out: string[][] = [];
  for (let r = 0; r < doc.nRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < doc.nCols; c++) {
      row.push(formatValue(getCell(doc, r, c), types[c], formats[c] ?? DEFAULT_FORMAT, locale));
    }
    out.push(row);
  }
  return out;
}

function markdown(ctx: ExportCtx): string {
  const rows = displayRows(ctx);
  if (rows.length === 0) return "";
  const esc = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const header = ctx.doc.hasHeader ? rows[0] : headerLabels(ctx);
  const body = ctx.doc.hasHeader ? rows.slice(1) : rows;
  const line = (r: string[]) => `| ${r.map(esc).join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  return [line(header), sep, ...body.map(line)].join("\n");
}

function htmlTable(ctx: ExportCtx): string {
  const rows = displayRows(ctx);
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines: string[] = ["<table>"];
  rows.forEach((r, i) => {
    const tag = ctx.doc.hasHeader && i === 0 ? "th" : "td";
    lines.push(`  <tr>${r.map((v) => `<${tag}>${esc(v)}</${tag}>`).join("")}</tr>`);
  });
  lines.push("</table>");
  return lines.join("\n");
}

function latex(ctx: ExportCtx): string {
  const rows = displayRows(ctx);
  if (rows.length === 0) return "";
  const cols = ctx.doc.nCols;
  const esc = (v: string) => v.replace(/([&%$#_{}])/g, "\\$1");
  const spec = "|" + Array.from({ length: cols }, (_, c) => (ctx.types[c] === "number" || ctx.types[c] === "integer" ? "r" : "l")).join("|") + "|";
  const lines = [`\\begin{tabular}{${spec}}`, "\\hline"];
  rows.forEach((r, i) => {
    lines.push(`${r.map(esc).join(" & ")} \\\\`);
    if (ctx.doc.hasHeader && i === 0) lines.push("\\hline");
  });
  lines.push("\\hline", "\\end{tabular}");
  return lines.join("\n");
}

// ── Code literals ────────────────────────────────────────────────────────────────

function pyLiteral(raw: string, type: ColumnType, locale: Locale): string {
  const t = classify(raw, type, locale);
  switch (t.t) {
    case "num": return String(t.v);
    case "bool": return t.v ? "True" : "False";
    case "empty": return "None";
    default: return `'${t.v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
}

function pythonExport(ctx: ExportCtx): string {
  const { doc, types, locale } = ctx;
  const [r0, r1] = dataRowRange(doc);
  if (doc.hasHeader) {
    const keys = headerLabels(ctx);
    const items: string[] = [];
    for (let r = r0; r < r1; r++) {
      const pairs = keys.map((k, c) => `'${k.replace(/'/g, "\\'")}': ${pyLiteral(getCell(doc, r, c), types[c], locale)}`);
      items.push(`{${pairs.join(", ")}}`);
    }
    return `[${items.join(", ")}]`;
  }
  const rows: string[] = [];
  for (let r = r0; r < r1; r++) {
    const cells = Array.from({ length: doc.nCols }, (_, c) => pyLiteral(getCell(doc, r, c), types[c], locale));
    rows.push(`[${cells.join(", ")}]`);
  }
  return `[${rows.join(", ")}]`;
}

function numericMatrix(ctx: ExportCtx): number[][] {
  const { doc, types, locale } = ctx;
  const [r0, r1] = dataRowRange(doc);
  const out: number[][] = [];
  for (let r = r0; r < r1; r++) {
    const row: number[] = [];
    for (let c = 0; c < doc.nCols; c++) {
      const t = classify(getCell(doc, r, c), types[c], locale);
      row.push(t.t === "num" ? t.v : t.t === "bool" ? Number(t.v) : NaN);
    }
    out.push(row);
  }
  return out;
}

function numpyExport(ctx: ExportCtx): string {
  const m = numericMatrix(ctx);
  const body = m.map((r) => `[${r.map((n) => (Number.isNaN(n) ? "np.nan" : n)).join(", ")}]`).join(", ");
  return `np.array([${body}])`;
}

function matlabExport(ctx: ExportCtx): string {
  const m = numericMatrix(ctx);
  return `[${m.map((r) => r.map((n) => (Number.isNaN(n) ? "NaN" : n)).join(" ")).join("; ")}]`;
}

function cInitExport(ctx: ExportCtx): string {
  const m = numericMatrix(ctx);
  const body = m.map((r) => `{${r.map((n) => (Number.isNaN(n) ? "0" : n)).join(", ")}}`).join(", ");
  return `{${body}}`;
}

// ── SQL ──────────────────────────────────────────────────────────────────────────

function sqlExport(ctx: ExportCtx): string {
  const { doc, types, locale } = ctx;
  const keys = headerLabels(ctx).map((k) => k.replace(/[^A-Za-z0-9_]/g, "_") || "col");
  const [r0, r1] = dataRowRange(doc);
  const lit = (raw: string, c: number) => {
    const t = classify(raw, types[c], locale);
    switch (t.t) {
      case "num": return String(t.v);
      case "bool": return t.v ? "TRUE" : "FALSE";
      case "empty": return "NULL";
      default: return `'${t.v.replace(/'/g, "''")}'`;
    }
  };
  const lines: string[] = [];
  for (let r = r0; r < r1; r++) {
    const vals = Array.from({ length: doc.nCols }, (_, c) => lit(getCell(doc, r, c), c));
    lines.push(`INSERT INTO ${tableName(doc)} (${keys.join(", ")}) VALUES (${vals.join(", ")});`);
  }
  return lines.join("\n");
}

function tableName(doc: TableDoc): string {
  return (doc.name || "data").replace(/[^A-Za-z0-9_]/g, "_") || "data";
}

// ── XLSX (binary, dynamic import) ────────────────────────────────────────────────

async function xlsxBlob(ctx: ExportCtx): Promise<Blob> {
  const XLSX = await import("xlsx");
  const aoa = rowsAsArrays(ctx, true);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ── Target registry ──────────────────────────────────────────────────────────────

export const EXPORT_TARGETS: ExportTarget[] = [
  { id: "csv", label: "CSV", ext: "csv", mime: "text/csv", toText: (c) => delimited(rawRows(c.doc), ",") },
  { id: "tsv", label: "TSV", ext: "tsv", mime: "text/tab-separated-values", toText: (c) => delimited(rawRows(c.doc), "\t") },
  { id: "json", label: "JSON (array of objects)", ext: "json", mime: "application/json", toText: (c) => JSON.stringify(c.doc.hasHeader ? rowsAsObjects(c) : rowsAsArrays(c, false), null, 2) },
  { id: "json-aoa", label: "JSON (array of arrays)", ext: "json", mime: "application/json", toText: (c) => JSON.stringify(rowsAsArrays(c, true), null, 2) },
  { id: "jsonl", label: "JSON Lines", ext: "jsonl", mime: "application/x-ndjson", toText: (c) => (c.doc.hasHeader ? rowsAsObjects(c) : rowsAsArrays(c, false)).map((o) => JSON.stringify(o)).join("\n") },
  { id: "markdown", label: "Markdown table", ext: "md", mime: "text/markdown", toText: markdown },
  { id: "html", label: "HTML table", ext: "html", mime: "text/html", toText: htmlTable },
  { id: "latex", label: "LaTeX tabular", ext: "tex", mime: "text/x-tex", toText: latex },
  { id: "python", label: "Python literal", ext: "py", mime: "text/x-python", toText: pythonExport },
  { id: "numpy", label: "NumPy array", ext: "py", mime: "text/x-python", toText: numpyExport },
  { id: "matlab", label: "MATLAB matrix", ext: "m", mime: "text/x-matlab", toText: matlabExport },
  { id: "c", label: "C initialiser", ext: "txt", mime: "text/plain", toText: cInitExport },
  { id: "sql", label: "SQL INSERT", ext: "sql", mime: "application/sql", toText: sqlExport },
  { id: "xlsx", label: "Excel (.xlsx)", ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", binary: true, toBlob: xlsxBlob },
];
