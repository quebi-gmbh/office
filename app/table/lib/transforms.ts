/**
 * Data transforms for the "Data" menu. All pure: a transform takes the active
 * sheet (a `TableDoc`) plus params and returns a new `TableDoc` (or, for
 * group+aggregate, a fresh row matrix destined for a new sheet). The caller
 * routes each through the single apply() choke-point so every transform is one
 * undo step.
 *
 * Row 0 is treated as a header when `doc.hasHeader` is set.
 */
import { type TableDoc, docFromRows, toRows } from "./model";

type Rows = string[][];

function bodyStart(doc: TableDoc): number {
  return doc.hasHeader ? 1 : 0;
}

function header(doc: TableDoc): string[] | null {
  return doc.hasHeader ? toRows(doc)[0] ?? [] : null;
}

function rebuild(doc: TableDoc, head: string[] | null, body: Rows): TableDoc {
  const rows = head ? [head, ...body] : body;
  const next = docFromRows(rows.length ? rows : [[""]], doc.name);
  return { ...next, id: doc.id, hasHeader: doc.hasHeader, colWidths: doc.colWidths.slice(0, next.nCols) };
}

// ── Deduplicate ─────────────────────────────────────────────────────────────

export function dedupeRows(doc: TableDoc, cols?: number[]): TableDoc {
  const all = toRows(doc);
  const head = header(doc);
  const body = all.slice(bodyStart(doc));
  const keyOf = (r: string[]) => JSON.stringify(cols && cols.length ? cols.map((c) => r[c] ?? "") : r);
  const seen = new Set<string>();
  const out: Rows = [];
  for (const r of body) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return rebuild(doc, head, out);
}

// ── Split column ─────────────────────────────────────────────────────────────

export function splitColumn(
  doc: TableDoc,
  col: number,
  opts: { delimiter?: string; regex?: string; fixedWidth?: number },
): TableDoc {
  const all = toRows(doc);
  const head = header(doc);
  const body = all.slice(bodyStart(doc));
  const splitter = (v: string): string[] => {
    if (opts.fixedWidth && opts.fixedWidth > 0) {
      const parts: string[] = [];
      for (let i = 0; i < v.length; i += opts.fixedWidth) parts.push(v.slice(i, i + opts.fixedWidth));
      return parts.length ? parts : [""];
    }
    if (opts.regex) {
      try {
        return v.split(new RegExp(opts.regex));
      } catch {
        return [v];
      }
    }
    return v.split(opts.delimiter ?? ",");
  };
  const maxParts = Math.max(1, ...body.map((r) => splitter(r[col] ?? "").length));
  const expand = (r: string[]): string[] => {
    const out = r.slice();
    const parts = splitter(r[col] ?? "");
    const padded = Array.from({ length: maxParts }, (_, i) => parts[i] ?? "");
    out.splice(col, 1, ...padded);
    return out;
  };
  const newHead = head
    ? (() => {
        const h = head.slice();
        const name = h[col] ?? "";
        h.splice(col, 1, ...Array.from({ length: maxParts }, (_, i) => `${name}_${i + 1}`));
        return h;
      })()
    : null;
  return rebuild(doc, newHead, body.map(expand));
}

// ── Merge / concat columns with a template ───────────────────────────────────

/** Template uses {0} {1} … (column indices) or {A} {B} … (letters). */
export function mergeColumns(doc: TableDoc, template: string, destName = "merged"): TableDoc {
  const all = toRows(doc);
  const head = header(doc);
  const body = all.slice(bodyStart(doc));
  const render = (r: string[]) =>
    template.replace(/\{([A-Za-z]+|\d+)\}/g, (_, ref: string) => {
      const idx = /^\d+$/.test(ref) ? parseInt(ref, 10) : letterToIndex(ref);
      return r[idx] ?? "";
    });
  const out = body.map((r) => [...r, render(r)]);
  const newHead = head ? [...head, destName] : null;
  return rebuild(doc, newHead, out);
}

function letterToIndex(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ── Trim / case / regex transforms on columns ────────────────────────────────

export type TextOp =
  | { kind: "trim" }
  | { kind: "upper" }
  | { kind: "lower" }
  | { kind: "title" }
  | { kind: "regex"; pattern: string; replacement: string };

export function transformColumns(doc: TableDoc, cols: number[], op: TextOp): TableDoc {
  const set = new Set(cols);
  const apply = (v: string): string => {
    switch (op.kind) {
      case "trim": return v.trim();
      case "upper": return v.toUpperCase();
      case "lower": return v.toLowerCase();
      case "title": return v.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
      case "regex":
        try { return v.replace(new RegExp(op.pattern, "g"), op.replacement); } catch { return v; }
    }
  };
  const start = bodyStart(doc);
  const cols2 = doc.cols.map((col, c) => {
    if (!set.has(c)) return col;
    const nc = col.slice();
    for (let r = start; r < nc.length; r++) nc[r] = apply(nc[r] ?? "");
    return nc;
  });
  return { ...doc, cols: cols2 };
}

// ── Fill down ─────────────────────────────────────────────────────────────────

export function fillDown(doc: TableDoc, cols?: number[]): TableDoc {
  const set = cols && cols.length ? new Set(cols) : null;
  const start = bodyStart(doc);
  const cols2 = doc.cols.map((col, c) => {
    if (set && !set.has(c)) return col;
    const nc = col.slice();
    let last = "";
    for (let r = start; r < doc.nRows; r++) {
      const v = nc[r] ?? "";
      if (v.trim() !== "") last = v;
      else if (last !== "") nc[r] = last;
    }
    return nc;
  });
  return { ...doc, cols: cols2 };
}

// ── Transpose ─────────────────────────────────────────────────────────────────

export function transpose(doc: TableDoc): TableDoc {
  const rows = toRows(doc);
  const out: Rows = [];
  for (let c = 0; c < doc.nCols; c++) out.push(rows.map((r) => r[c] ?? ""));
  const next = docFromRows(out.length ? out : [[""]], doc.name);
  return { ...next, id: doc.id, hasHeader: false };
}

// ── Unpivot / melt ────────────────────────────────────────────────────────────

export function unpivot(doc: TableDoc, idCols: number[], valueCols: number[]): TableDoc {
  const all = toRows(doc);
  const head = header(doc) ?? all[0]?.map((_, i) => `col${i}`) ?? [];
  const body = all.slice(bodyStart(doc));
  const out: Rows = [];
  for (const r of body) {
    for (const vc of valueCols) {
      out.push([...idCols.map((c) => r[c] ?? ""), head[vc] ?? "", r[vc] ?? ""]);
    }
  }
  const newHead = [...idCols.map((c) => head[c] ?? `col${c}`), "variable", "value"];
  return rebuild({ ...doc, hasHeader: true }, newHead, out);
}

// ── Group + aggregate ─────────────────────────────────────────────────────────

export type AggFn = "sum" | "avg" | "min" | "max" | "count" | "median" | "countDistinct";

export interface AggSpec {
  col: number;
  fn: AggFn;
}

function aggregate(values: number[], strings: string[], fn: AggFn): string {
  switch (fn) {
    case "count": return String(strings.length);
    case "countDistinct": return String(new Set(strings).size);
    case "sum": return String(values.reduce((a, b) => a + b, 0));
    case "avg": return values.length ? String(values.reduce((a, b) => a + b, 0) / values.length) : "";
    case "min": return values.length ? String(Math.min(...values)) : "";
    case "max": return values.length ? String(Math.max(...values)) : "";
    case "median": {
      if (!values.length) return "";
      const s = values.slice().sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return String(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
    }
  }
}

/** Returns the result as a row matrix (header + body) for a NEW sheet. */
export function groupAggregate(doc: TableDoc, groupCols: number[], aggs: AggSpec[]): Rows {
  const head = header(doc);
  const start = bodyStart(doc);
  const groups = new Map<string, { vals: string[]; idxs: number[] }>(); // key → row indices
  const order: string[] = [];
  for (let r = start; r < doc.nRows; r++) {
    const vals = groupCols.map((c) => doc.cols[c]?.[r] ?? "");
    const key = JSON.stringify(vals);
    let g = groups.get(key);
    if (!g) { g = { vals, idxs: [] }; groups.set(key, g); order.push(key); }
    g.idxs.push(r);
  }
  const colName = (c: number) => head?.[c] ?? `col${c}`;
  const outHead = [
    ...groupCols.map(colName),
    ...aggs.map((a) => `${a.fn}(${colName(a.col)})`),
  ];
  const body: Rows = [];
  for (const key of order) {
    const g = groups.get(key)!;
    const idxs = g.idxs;
    const groupVals = g.vals;
    const aggVals = aggs.map((a) => {
      const strs: string[] = [];
      const nums: number[] = [];
      for (const r of idxs) {
        const v = doc.cols[a.col]?.[r] ?? "";
        strs.push(v);
        const n = parseFloat(v.replace(/,/g, ""));
        if (Number.isFinite(n)) nums.push(n);
      }
      return aggregate(nums, strs, a.fn);
    });
    body.push([...groupVals, ...aggVals]);
  }
  return [outHead, ...body];
}

// ── Flash-fill ────────────────────────────────────────────────────────────────

type RecipePart =
  | { kind: "lit"; text: string }
  | { kind: "field"; col: number; token: "whole" | number; caseOp: "as" | "lower" | "upper" | "title" };

function tokensOf(v: string): { text: string; token: "whole" | number }[] {
  const out: { text: string; token: "whole" | number }[] = [{ text: v, token: "whole" }];
  const words = v.split(/\s+/).filter(Boolean);
  words.forEach((w, i) => out.push({ text: w, token: i }));
  return out;
}

type CaseOp = "as" | "lower" | "upper" | "title";

function applyCase(s: string, op: CaseOp): string {
  switch (op) {
    case "lower": return s.toLowerCase();
    case "upper": return s.toUpperCase();
    case "title": return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    default: return s;
  }
}

const CASES: CaseOp[] = ["as", "lower", "upper", "title"];

/** Infer a recipe that turns `inputs` into `output`, or null. */
function synthesize(inputs: string[], output: string): RecipePart[] | null {
  const parts: RecipePart[] = [];
  let pos = 0;
  let guard = 0;
  while (pos < output.length && guard++ < 200) {
    let matched = false;
    // Try the longest field-token match first.
    let best: { len: number; part: RecipePart } | null = null;
    for (let col = 0; col < inputs.length; col++) {
      for (const tk of tokensOf(inputs[col])) {
        if (tk.text.length < 2 && tk.token !== "whole") continue;
        for (const c of CASES) {
          const cand = applyCase(tk.text, c);
          if (cand.length >= 2 && output.startsWith(cand, pos)) {
            if (!best || cand.length > best.len) best = { len: cand.length, part: { kind: "field", col, token: tk.token, caseOp: c } };
          }
        }
      }
    }
    if (best) {
      parts.push(best.part);
      pos += best.len;
      matched = true;
    }
    if (!matched) {
      // Accumulate a literal char.
      const lastP = parts[parts.length - 1];
      if (lastP && lastP.kind === "lit") lastP.text += output[pos];
      else parts.push({ kind: "lit", text: output[pos] });
      pos++;
    }
  }
  return pos >= output.length ? parts : null;
}

function runRecipe(recipe: RecipePart[], inputs: string[]): string {
  return recipe
    .map((p) => {
      if (p.kind === "lit") return p.text;
      const words = inputs[p.col]?.split(/\s+/).filter(Boolean) ?? [];
      const raw = p.token === "whole" ? inputs[p.col] ?? "" : words[p.token] ?? "";
      return applyCase(raw, p.caseOp);
    })
    .join("");
}

/**
 * Flash-fill column `targetCol` from a few filled examples, using the other
 * columns as inputs. Returns a new doc, or the original if no consistent
 * recipe is found.
 */
export function flashFill(doc: TableDoc, targetCol: number): TableDoc {
  const start = bodyStart(doc);
  const inputsOf = (r: number) =>
    doc.cols.map((c, ci) => (ci === targetCol ? "" : c[r] ?? "")).filter((_, ci) => ci !== targetCol);
  // Gather example rows (target non-empty) and blanks.
  const examples: number[] = [];
  const blanks: number[] = [];
  for (let r = start; r < doc.nRows; r++) {
    const t = doc.cols[targetCol]?.[r] ?? "";
    const anyInput = inputsOf(r).some((v) => v.trim() !== "");
    if (t.trim() !== "") examples.push(r);
    else if (anyInput) blanks.push(r);
  }
  if (examples.length === 0 || blanks.length === 0) return doc;

  // Synthesize from the first example, verify against the rest.
  const recipe = synthesize(inputsOf(examples[0]), doc.cols[targetCol][examples[0]]);
  if (!recipe) return doc;
  for (const r of examples.slice(1)) {
    if (runRecipe(recipe, inputsOf(r)) !== doc.cols[targetCol][r]) return doc;
  }
  const col = doc.cols[targetCol].slice();
  for (const r of blanks) col[r] = runRecipe(recipe, inputsOf(r));
  const cols = doc.cols.slice();
  cols[targetCol] = col;
  return { ...doc, cols };
}
