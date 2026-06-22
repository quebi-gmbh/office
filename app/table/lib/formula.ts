/**
 * Hand-written formula engine for `/table` (phase 2.3). HyperFormula is
 * deliberately NOT used — this keeps the chunk small and the surface focused.
 *
 * A cell whose raw value starts with "=" is a formula. The engine parses each
 * formula (recursive descent), resolves cell/range references (including
 * cross-sheet `Sheet2!A1`) against the workbook, evaluates with memoisation, and
 * detects circular references (→ `#CIRCULAR!`). Other failures render `#ERROR!`.
 *
 * Recompute is whole-workbook and lazy-per-cell with memo, so a 1k-formula sheet
 * recomputes well under the 50 ms budget.
 */
import { type TableDoc, labelToCol } from "./model";
import type { Workbook } from "./workbook";

export const CIRCULAR = "#CIRCULAR!";
export const ERROR = "#ERROR!";

export function isFormula(raw: string): boolean {
  return raw.length > 1 && raw[0] === "=";
}

export type CellValue = number | string | boolean;
export interface CellError {
  error: string;
  reason?: string;
}
type Result = CellValue | CellError;

function isErr(v: unknown): v is CellError {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "error" in v;
}

// ── Tokeniser ──────────────────────────────────────────────────────────────────

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; v: string }
  | { t: "op"; v: string }
  | { t: "fn"; v: string }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "comma" }
  | { t: "colon" };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const s = src;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch === '"') {
      let v = "";
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '"' && s[i + 1] === '"') { v += '"'; i += 2; continue; }
        v += s[i++];
      }
      i++;
      toks.push({ t: "str", v });
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.eE]/.test(s[j])) {
        if ((s[j] === "e" || s[j] === "E") && (s[j + 1] === "+" || s[j + 1] === "-")) j++;
        j++;
      }
      toks.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      // identifier may contain letters/digits/_/!/. for sheet refs (Sheet1!A1)
      while (j < s.length && /[A-Za-z0-9_!.$]/.test(s[j])) j++;
      const word = s.slice(i, j);
      i = j;
      // function call if followed by "("
      let k = i;
      while (k < s.length && (s[k] === " " || s[k] === "\t")) k++;
      if (s[k] === "(") {
        toks.push({ t: "fn", v: word.toUpperCase() });
      } else if (/^(TRUE|FALSE)$/i.test(word)) {
        toks.push({ t: "num", v: /true/i.test(word) ? 1 : 0 });
      } else {
        toks.push({ t: "ref", v: word });
      }
      continue;
    }
    // operators
    const two = s.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { toks.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>".includes(ch)) { toks.push({ t: "op", v: ch }); i++; continue; }
    if (ch === "(") { toks.push({ t: "lparen" }); i++; continue; }
    if (ch === ")") { toks.push({ t: "rparen" }); i++; continue; }
    if (ch === ",") { toks.push({ t: "comma" }); i++; continue; }
    if (ch === ":") { toks.push({ t: "colon" }); i++; continue; }
    throw new Error(`Unexpected '${ch}'`);
  }
  return toks;
}

// ── AST ────────────────────────────────────────────────────────────────────────

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "ref"; v: string }
  | { k: "range"; a: string; b: string }
  | { k: "unary"; op: string; e: Node }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "call"; name: string; args: Node[] };

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  private peek() { return this.toks[this.p]; }
  private next() { return this.toks[this.p++]; }

  parse(): Node {
    const n = this.expr();
    if (this.p < this.toks.length) throw new Error("Trailing tokens");
    return n;
  }
  // comparison (lowest)
  private expr(): Node {
    let l = this.concat();
    while (this.peek()?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      l = { k: "bin", op, l, r: this.concat() };
    }
    return l;
  }
  private concat(): Node {
    let l = this.add();
    while (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "&") {
      this.next();
      l = { k: "bin", op: "&", l, r: this.add() };
    }
    return l;
  }
  private add(): Node {
    let l = this.mul();
    while (this.peek()?.t === "op" && ["+", "-"].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      l = { k: "bin", op, l, r: this.mul() };
    }
    return l;
  }
  private mul(): Node {
    let l = this.pow();
    while (this.peek()?.t === "op" && ["*", "/"].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      l = { k: "bin", op, l, r: this.pow() };
    }
    return l;
  }
  private pow(): Node {
    const l = this.unary();
    if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "^") {
      this.next();
      return { k: "bin", op: "^", l, r: this.pow() };
    }
    return l;
  }
  private unary(): Node {
    if (this.peek()?.t === "op" && ["-", "+"].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      return { k: "unary", op, e: this.unary() };
    }
    return this.primary();
  }
  private primary(): Node {
    const tk = this.next();
    if (!tk) throw new Error("Unexpected end");
    if (tk.t === "num") return { k: "num", v: tk.v };
    if (tk.t === "str") return { k: "str", v: tk.v };
    if (tk.t === "lparen") {
      const e = this.expr();
      if (this.next()?.t !== "rparen") throw new Error("Expected )");
      return e;
    }
    if (tk.t === "ref") {
      if (this.peek()?.t === "colon") {
        this.next();
        const b = this.next();
        if (!b || b.t !== "ref") throw new Error("Expected range end");
        return { k: "range", a: tk.v, b: b.v };
      }
      return { k: "ref", v: tk.v };
    }
    if (tk.t === "fn") {
      if (this.next()?.t !== "lparen") throw new Error("Expected (");
      const args: Node[] = [];
      if (this.peek()?.t !== "rparen") {
        args.push(this.expr());
        while (this.peek()?.t === "comma") { this.next(); args.push(this.expr()); }
      }
      if (this.next()?.t !== "rparen") throw new Error("Expected )");
      return { k: "call", name: tk.v, args };
    }
    throw new Error("Unexpected token");
  }
}

// ── Reference parsing ───────────────────────────────────────────────────────────

interface Ref {
  sheet: string | null;
  r: number;
  c: number;
}

function parseRefStr(ref: string): Ref | null {
  let sheet: string | null = null;
  let body = ref;
  const bang = ref.indexOf("!");
  if (bang >= 0) {
    sheet = ref.slice(0, bang).replace(/^'|'$/g, "");
    body = ref.slice(bang + 1);
  }
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(body);
  if (!m) return null;
  return { sheet, c: labelToCol(m[1]), r: parseInt(m[2], 10) - 1 };
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class FormulaEngine {
  private sheets: TableDoc[];
  private byName = new Map<string, number>();
  private memo = new Map<string, Result>();
  private computing = new Set<string>();
  private parseCache = new Map<string, Node | Error>();

  constructor(wb: Workbook) {
    this.sheets = wb.sheets;
    wb.sheets.forEach((s, i) => this.byName.set(s.name.toLowerCase(), i));
  }

  private key(si: number, r: number, c: number) { return `${si}:${r}:${c}`; }

  private rawAt(si: number, r: number, c: number): string {
    return this.sheets[si]?.cols[c]?.[r] ?? "";
  }

  /** Evaluated display result for a cell. */
  evalCell(si: number, r: number, c: number): Result {
    const k = this.key(si, r, c);
    if (this.memo.has(k)) return this.memo.get(k)!;
    const raw = this.rawAt(si, r, c);
    if (!isFormula(raw)) {
      const v = literal(raw);
      this.memo.set(k, v);
      return v;
    }
    if (this.computing.has(k)) return { error: CIRCULAR };
    this.computing.add(k);
    let result: Result;
    try {
      const ast = this.parseFormula(raw.slice(1));
      result = ast instanceof Error ? { error: ERROR, reason: ast.message } : this.evalNode(ast, si);
    } catch (e) {
      result = { error: ERROR, reason: (e as Error).message };
    }
    this.computing.delete(k);
    this.memo.set(k, result);
    return result;
  }

  /** Display text for a cell (formula → evaluated, else raw). */
  displayText(si: number, r: number, c: number): string | null {
    const raw = this.rawAt(si, r, c);
    if (!isFormula(raw)) return null;
    const v = this.evalCell(si, r, c);
    return resultToText(v);
  }

  private parseFormula(body: string): Node | Error {
    const cached = this.parseCache.get(body);
    if (cached) return cached;
    let res: Node | Error;
    try {
      res = new Parser(tokenize(body)).parse();
    } catch (e) {
      res = e as Error;
    }
    this.parseCache.set(body, res);
    return res;
  }

  private resolveSheet(name: string | null, fallback: number): number | null {
    if (name === null) return fallback;
    const i = this.byName.get(name.toLowerCase());
    return i === undefined ? null : i;
  }

  private evalNode(n: Node, si: number): Result {
    switch (n.k) {
      case "num": return n.v;
      case "str": return n.v;
      case "ref": {
        const ref = parseRefStr(n.v);
        if (!ref) return { error: ERROR, reason: `Bad ref ${n.v}` };
        const sheet = this.resolveSheet(ref.sheet, si);
        if (sheet === null) return { error: ERROR, reason: `No sheet ${ref.sheet}` };
        return this.evalCell(sheet, ref.r, ref.c);
      }
      case "range": return { error: ERROR, reason: "Range outside a function" };
      case "unary": {
        const v = this.evalNode(n.e, si);
        if (isErr(v)) return v;
        return n.op === "-" ? -toNum(v) : toNum(v);
      }
      case "bin": return this.evalBin(n, si);
      case "call": return this.evalCall(n, si);
    }
  }

  private rangeValues(n: { a: string; b: string }, si: number): Result[] | CellError {
    const a = parseRefStr(n.a);
    const b = parseRefStr(n.b);
    if (!a || !b) return { error: ERROR, reason: "Bad range" };
    const sheet = this.resolveSheet(a.sheet, si);
    if (sheet === null) return { error: ERROR, reason: `No sheet ${a.sheet}` };
    const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
    const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
    const out: Result[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(this.evalCell(sheet, r, c));
    return out;
  }

  private argValues(args: Node[], si: number): Result[] | CellError {
    const out: Result[] = [];
    for (const a of args) {
      if (a.k === "range") {
        const vals = this.rangeValues(a, si);
        if (isErr(vals)) return vals;
        out.push(...vals);
      } else {
        out.push(this.evalNode(a, si));
      }
    }
    return out;
  }

  private evalBin(n: { op: string; l: Node; r: Node }, si: number): Result {
    const l = this.evalNode(n.l, si);
    if (isErr(l)) return l;
    const r = this.evalNode(n.r, si);
    if (isErr(r)) return r;
    switch (n.op) {
      case "+": return toNum(l) + toNum(r);
      case "-": return toNum(l) - toNum(r);
      case "*": return toNum(l) * toNum(r);
      case "/": { const d = toNum(r); return d === 0 ? { error: ERROR, reason: "Divide by zero" } : toNum(l) / d; }
      case "^": return Math.pow(toNum(l), toNum(r));
      case "&": return toStr(l) + toStr(r);
      case "=": return looseEq(l, r);
      case "<>": return !looseEq(l, r);
      case "<": return cmp(l, r) < 0;
      case ">": return cmp(l, r) > 0;
      case "<=": return cmp(l, r) <= 0;
      case ">=": return cmp(l, r) >= 0;
    }
    return { error: ERROR };
  }

  private evalCall(n: { name: string; args: Node[] }, si: number): Result {
    const name = n.name;
    // IF / AND / OR / NOT handle their own arg evaluation for short-circuit.
    if (name === "IF") {
      const cond = this.evalNode(n.args[0], si);
      if (isErr(cond)) return cond;
      const branch = toBool(cond) ? n.args[1] : n.args[2];
      return branch ? this.evalNode(branch, si) : false;
    }
    const vals = this.argValues(n.args, si);
    if (isErr(vals)) return vals;
    const nums = vals.filter((v) => !isErr(v)).map(toNum);
    switch (name) {
      case "SUM": return nums.reduce((a, b) => a + b, 0);
      case "AVG":
      case "AVERAGE": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : { error: ERROR };
      case "MIN": return nums.length ? Math.min(...nums) : 0;
      case "MAX": return nums.length ? Math.max(...nums) : 0;
      case "COUNT": return vals.filter((v) => !isErr(v) && isNumericStr(v)).length;
      case "COUNTA": return vals.filter((v) => !isErr(v) && toStr(v) !== "").length;
      case "AND": return vals.every((v) => !isErr(v) && toBool(v));
      case "OR": return vals.some((v) => !isErr(v) && toBool(v));
      case "NOT": return !toBool(vals[0]);
      case "CONCAT":
      case "CONCATENATE": return vals.map(toStr).join("");
      case "LEN": return toStr(vals[0]).length;
      case "UPPER": return toStr(vals[0]).toUpperCase();
      case "LOWER": return toStr(vals[0]).toLowerCase();
      case "TRIM": return toStr(vals[0]).trim();
      case "ROUND": { const d = vals[1] !== undefined ? toNum(vals[1]) : 0; const f = 10 ** d; return Math.round(toNum(vals[0]) * f) / f; }
      case "ABS": return Math.abs(toNum(vals[0]));
      case "NOW": return new Date().toISOString().replace("T", " ").slice(0, 19);
      case "TODAY": return new Date().toISOString().slice(0, 10);
      default: return { error: ERROR, reason: `Unknown function ${name}` };
    }
  }
}

// ── Coercion helpers ────────────────────────────────────────────────────────────

function literal(raw: string): CellValue {
  const t = raw.trim();
  if (t === "") return "";
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return parseFloat(t);
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  return raw;
}

function isNumericStr(v: CellValue): boolean {
  return typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
}

function toNum(v: Result): number {
  if (isErr(v)) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function toStr(v: Result): string {
  if (isErr(v)) return v.error;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

function toBool(v: Result): boolean {
  if (isErr(v)) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.trim() !== "" && !/^false$/i.test(v);
}

function looseEq(a: Result, b: Result): boolean {
  if (isErr(a) || isErr(b)) return false;
  if (typeof a === "number" || typeof b === "number") return toNum(a) === toNum(b);
  return toStr(a).toLowerCase() === toStr(b).toLowerCase();
}

function cmp(a: Result, b: Result): number {
  if (typeof a === "number" || typeof b === "number") return toNum(a) - toNum(b);
  return toStr(a) < toStr(b) ? -1 : toStr(a) > toStr(b) ? 1 : 0;
}

export function resultToText(v: Result): string {
  if (isErr(v)) return v.error;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ERROR;
    return String(Math.round(v * 1e10) / 1e10);
  }
  return v;
}
