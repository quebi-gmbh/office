/**
 * Tabular format auto-detection for `/table` imports.
 *
 * Pure, dependency-free functions (XLSX is the one exception and lives outside
 * this module since it needs a binary parser). Everything here turns a *string*
 * — pasted text or a dropped text file — into a row-major `string[][]` plus a
 * best guess at the source format and the options used, so the import preview
 * modal can show what we found and let the user override it.
 *
 * Covered: delimited text (comma / tab / semicolon / pipe, quote-aware),
 * JSON (array-of-objects, array-of-arrays, JSONL), HTML `<table>`, Markdown
 * pipe tables, and code-form arrays (Python / JS lists, MATLAB, NumPy, C-init).
 */

export type TableFormat =
  | "csv"
  | "tsv"
  | "delimited"
  | "json-aoo" // array of objects
  | "json-aoa" // array of arrays
  | "jsonl"
  | "html"
  | "markdown"
  | "python"
  | "matlab"
  | "numpy"
  | "c"
  | "unknown";

export interface ParseOptions {
  delimiter?: string;
  quote?: string;
  hasHeader?: boolean;
}

export interface Detection {
  format: TableFormat;
  /** Parsed rows, row-major. The first row is the header iff `hasHeader`. */
  rows: string[][];
  hasHeader: boolean;
  /** Delimiter that was used, for delimited formats (display + re-parse). */
  delimiter?: string;
  quote?: string;
}

const DELIMITERS = [",", "\t", ";", "|"] as const;

// ── Delimited (CSV/TSV/…) ───────────────────────────────────────────────────

/**
 * RFC-4180-ish delimited parser: quote-aware, handles doubled quotes ("") and
 * delimiters / newlines inside quoted fields. CRLF and LF both accepted.
 */
export function parseDelimited(
  text: string,
  delimiter: string,
  quote = '"',
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const s = text;

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === quote) {
        if (s[i + 1] === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === quote && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  let best = 0;
  let bestN = -1;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestN || (c === bestN && n > best)) {
      bestN = c;
      best = n;
    }
  }
  return best;
}

/** Pick the delimiter that yields the most consistent, widest rows. */
export function sniffDelimiter(text: string): string {
  const sample = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 20)
    .join("\n");
  let best = ",";
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const rows = parseDelimited(sample, d);
    if (rows.length === 0) continue;
    const counts = rows.map((r) => r.length);
    const m = mode(counts);
    if (m <= 1) continue;
    const consistent = counts.filter((c) => c === m).length / counts.length;
    const score = consistent * m;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

// ── JSON variants ───────────────────────────────────────────────────────────

function jsonScalar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function unionKeys(objs: Record<string, unknown>[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const o of objs) {
    for (const k of Object.keys(o)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseJsonTable(text: string): Detection | null {
  const t = text.trim();
  if (!t) return null;

  // Whole-document JSON first.
  if (t[0] === "[" || t[0] === "{") {
    try {
      const v = JSON.parse(t);
      const d = jsonValueToTable(v);
      if (d) return d;
    } catch {
      /* fall through to JSONL */
    }
  }

  // JSONL: one JSON value per non-blank line.
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 1) {
    try {
      const vals = lines.map((l) => JSON.parse(l));
      if (vals.length > 1 || lines.length > 1) {
        if (vals.every(isPlainObject)) {
          const keys = unionKeys(vals as Record<string, unknown>[]);
          return {
            format: "jsonl",
            hasHeader: true,
            rows: [keys, ...vals.map((o) => keys.map((k) => jsonScalar((o as Record<string, unknown>)[k])))],
          };
        }
        if (vals.every((v) => Array.isArray(v))) {
          return {
            format: "jsonl",
            hasHeader: false,
            rows: (vals as unknown[][]).map((r) => r.map(jsonScalar)),
          };
        }
      }
    } catch {
      /* not JSONL */
    }
  }
  return null;
}

function jsonValueToTable(v: unknown): Detection | null {
  if (Array.isArray(v)) {
    if (v.length === 0) return { format: "json-aoa", hasHeader: false, rows: [[""]] };
    if (v.every(isPlainObject)) {
      const keys = unionKeys(v as Record<string, unknown>[]);
      return {
        format: "json-aoo",
        hasHeader: true,
        rows: [keys, ...v.map((o) => keys.map((k) => jsonScalar((o as Record<string, unknown>)[k])))],
      };
    }
    if (v.every((x) => Array.isArray(x))) {
      return {
        format: "json-aoa",
        hasHeader: false,
        rows: (v as unknown[][]).map((r) => r.map(jsonScalar)),
      };
    }
    // Array of scalars → single column.
    return { format: "json-aoa", hasHeader: false, rows: v.map((x) => [jsonScalar(x)]) };
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    return { format: "json-aoo", hasHeader: true, rows: [keys, keys.map((k) => jsonScalar(v[k]))] };
  }
  return null;
}

// ── HTML <table> ─────────────────────────────────────────────────────────────

export function parseHtmlTable(text: string): Detection | null {
  if (!/<table[\s>]/i.test(text)) return null;
  return typeof DOMParser !== "undefined"
    ? parseHtmlWithDom(text)
    : parseHtmlWithRegex(text);
}

function parseHtmlWithDom(text: string): Detection | null {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const trs = Array.from(table.querySelectorAll("tr"));
  if (trs.length === 0) return null;
  const rows = trs.map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((cell) =>
      (cell.textContent ?? "").trim(),
    ),
  );
  const hasHeader = trs[0].querySelector("th") != null;
  return { format: "html", hasHeader, rows };
}

/** DOM-free fallback (non-browser contexts + unit tests). */
function parseHtmlWithRegex(text: string): Detection | null {
  const table = /<table[\s\S]*?<\/table>/i.exec(text)?.[0];
  if (!table) return null;
  const trMatches = table.match(/<tr[\s\S]*?<\/tr>/gi);
  if (!trMatches) return null;
  const rows = trMatches.map((tr) => {
    const cells = tr.match(/<(td|th)[\s\S]*?<\/(td|th)>/gi) ?? [];
    return cells.map((c) =>
      decodeEntities(c.replace(/<[^>]+>/g, "")).trim(),
    );
  });
  const hasHeader = /<th[\s>]/i.test(trMatches[0]);
  return { format: "html", hasHeader, rows };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ── Markdown pipe tables ─────────────────────────────────────────────────────

const MD_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

export function parseMarkdownTable(text: string): Detection | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Need a header line, a separator line, then ≥0 body lines.
  const sepIdx = lines.findIndex((l, i) => i > 0 && MD_SEPARATOR.test(l) && l.includes("-"));
  if (sepIdx < 1) return null;
  const splitRow = (l: string) =>
    l
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());
  const header = splitRow(lines[sepIdx - 1]);
  const body = lines.slice(sepIdx + 1).map(splitRow);
  return { format: "markdown", hasHeader: true, rows: [header, ...body] };
}

// ── Code-form arrays (Python / JS / NumPy / MATLAB / C) ──────────────────────

export function parseCodeArray(text: string): Detection | null {
  let t = text.trim();
  if (!t) return null;

  // NumPy: np.array([...]) / numpy.array([...])
  const np = /^(?:np|numpy)\s*\.\s*array\s*\(([\s\S]*)\)\s*$/.exec(t);
  if (np) {
    const inner = stripTrailingArgs(np[1]);
    const d = pyLikeToTable(inner);
    if (d) return { ...d, format: "numpy" };
  }

  // MATLAB: [1 2 3; 4 5 6]
  if (/^\[[^[\]{}]*;[^[\]{}]*\]$/.test(t) || (/^\[[^[\]{}]*\]$/.test(t) && /\d\s+\d/.test(t))) {
    const inner = t.slice(1, -1);
    const rows = inner
      .split(";")
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((r) => r.split(/[\s,]+/).filter(Boolean));
    if (rows.length > 0 && rows.some((r) => r.length > 0)) {
      return { format: "matlab", hasHeader: false, rows };
    }
  }

  // C / C++ initialiser: {{1,2},{3,4}} → convert braces to brackets, parse.
  if (/^\{[\s\S]*\}$/.test(t) && t.includes("{", 1)) {
    const bracketed = t.replace(/\{/g, "[").replace(/\}/g, "]");
    const d = pyLikeToTable(bracketed);
    if (d) return { ...d, format: "c" };
  }

  // Python / JS list literal: [[...], [...]] or [..]
  if (/^\[[\s\S]*\]$/.test(t)) {
    const d = pyLikeToTable(t);
    if (d) return { ...d, format: "python" };
  }
  return null;
}

/** Drop trailing kwargs like `, dtype=int` from a NumPy call's inner text. */
function stripTrailingArgs(inner: string): string {
  const t = inner.trim();
  // Find the matching close of the first bracketed expression.
  if (t[0] !== "[") return t;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "[") depth++;
    else if (t[i] === "]") {
      depth--;
      if (depth === 0) return t.slice(0, i + 1);
    }
  }
  return t;
}

/** Parse a Python/JS-ish nested list into rows by JSON-normalising it. */
function pyLikeToTable(src: string): Detection | null {
  const normalised = pyToJson(src);
  let v: unknown;
  try {
    v = JSON.parse(normalised);
  } catch {
    return null;
  }
  if (!Array.isArray(v)) return null;
  if (v.every((x) => Array.isArray(x))) {
    return { format: "python", hasHeader: false, rows: (v as unknown[][]).map((r) => r.map(jsonScalar)) };
  }
  // 1-D → single row.
  return { format: "python", hasHeader: false, rows: [v.map(jsonScalar)] };
}

/** Best-effort Python/JS literal → JSON: quotes, True/False/None, tuples. */
function pyToJson(src: string): string {
  let out = "";
  let inStr: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") {
        out += ch + (src[i + 1] ?? "");
        i++;
        continue;
      }
      if (ch === inStr) {
        out += '"';
        inStr = null;
        continue;
      }
      out += ch === '"' ? '\\"' : ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = ch;
      out += '"';
      continue;
    }
    if (ch === "(") {
      out += "[";
      continue;
    }
    if (ch === ")") {
      out += "]";
      continue;
    }
    out += ch;
  }
  return out
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\b(None|nan|NaN)\b/g, "null")
    .replace(/,(\s*[\]}])/g, "$1"); // trailing commas
}

// ── Header guess ─────────────────────────────────────────────────────────────

const NUMERIC_RE = /^-?[\d.,]+(?:[eE][-+]?\d+)?%?$/;

/** Heuristic: a first row of all-non-numeric strings over numeric-ish bodies
 *  is probably a header. */
export function guessHasHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const header = rows[0];
  // A header shouldn't contain numbers, and every label should be non-empty.
  if (header.some((c) => NUMERIC_RE.test(c.trim()))) return false;
  return header.every((c) => c.trim().length > 0);
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/** Detect the most likely tabular format of `text` and parse it. */
export function detect(text: string, filenameHint?: string): Detection {
  const ext = filenameHint?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

  // Honour an unambiguous file extension first, then fall back to sniffing.
  if (ext === "json") {
    const j = parseJsonTable(text);
    if (j) return j;
  }
  if (ext === "jsonl" || ext === "ndjson") {
    const j = parseJsonTable(text);
    if (j) return j;
  }
  if (ext === "html" || ext === "htm") {
    const h = parseHtmlTable(text);
    if (h) return h;
  }
  if (ext === "md" || ext === "markdown") {
    const m = parseMarkdownTable(text);
    if (m) return m;
  }

  // Content sniffing, most specific first.
  const html = parseHtmlTable(text);
  if (html) return html;

  const json = parseJsonTable(text);
  if (json) return json;

  const code = parseCodeArray(text);
  if (code) return code;

  const md = parseMarkdownTable(text);
  if (md) return md;

  // Delimited fallback.
  const delimiter = ext === "tsv" ? "\t" : ext === "csv" ? "," : sniffDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  const format: TableFormat = delimiter === "\t" ? "tsv" : delimiter === "," ? "csv" : "delimited";
  return {
    format,
    delimiter,
    quote: '"',
    rows,
    hasHeader: guessHasHeader(rows),
  };
}

/** Re-parse `text` as a delimited file with explicit options (modal overrides). */
export function reparseDelimited(text: string, opts: ParseOptions): Detection {
  const delimiter = opts.delimiter ?? sniffDelimiter(text);
  const quote = opts.quote ?? '"';
  const rows = parseDelimited(text, delimiter, quote);
  return {
    format: delimiter === "\t" ? "tsv" : delimiter === "," ? "csv" : "delimited",
    delimiter,
    quote,
    rows,
    hasHeader: opts.hasHeader ?? guessHasHeader(rows),
  };
}

export const FORMAT_LABELS: Record<TableFormat, string> = {
  csv: "CSV (comma-separated)",
  tsv: "TSV (tab-separated)",
  delimited: "Delimited text",
  "json-aoo": "JSON (array of objects)",
  "json-aoa": "JSON (array of arrays)",
  jsonl: "JSON Lines",
  html: "HTML table",
  markdown: "Markdown table",
  python: "Python / JS list",
  matlab: "MATLAB matrix",
  numpy: "NumPy array",
  c: "C initialiser",
  unknown: "Unknown",
};
