/**
 * Conditional formatting rules + evaluation. Rules persist on the sheet and are
 * applied per cell by the grid. A rule targets a rectangular range (source
 * coords). Three kinds: 2/3-stop colour scale, in-cell data bar, and a custom
 * expression (reusing the formula evaluator) that toggles a fill colour.
 */
import { type TableDoc, getCell } from "./model";
import { type Rect, inRect } from "./selection";
import { evaluateExpression, isError, toBoolean } from "./formula";

export type CondRule =
  | { kind: "colorScale"; range: Rect; stops: 2 | 3; colors: string[] }
  | { kind: "dataBar"; range: Rect; color: string }
  | { kind: "custom"; range: Rect; expr: string; color: string };

export interface CellDecoration {
  bg?: string;
  /** Data-bar fill fraction 0..1. */
  bar?: number;
  barColor?: string;
}

function numAt(doc: TableDoc, r: number, c: number): number | null {
  const v = getCell(doc, r, c).trim();
  if (v === "") return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Min/max of numeric cells in a range (cached per rule by the caller). */
export function rangeMinMax(doc: TableDoc, range: Rect): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (let r = range.r0; r <= range.r1; r++) {
    for (let c = range.c0; c <= range.c1; c++) {
      const n = numAt(doc, r, c);
      if (n === null) continue;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  return min === Infinity ? null : { min, max };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function mix(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

export interface RuleStats {
  minMax: { min: number; max: number } | null;
}

/** Precompute per-rule stats once (min/max) for the visible render pass. */
export function precomputeStats(doc: TableDoc, rules: CondRule[]): RuleStats[] {
  return rules.map((rule) =>
    rule.kind === "colorScale" || rule.kind === "dataBar"
      ? { minMax: rangeMinMax(doc, rule.range) }
      : { minMax: null },
  );
}

/** Decoration for one cell, applying all matching rules (last rule wins for bg). */
export function decorate(
  doc: TableDoc,
  r: number,
  c: number,
  rules: CondRule[],
  stats: RuleStats[],
): CellDecoration | null {
  let deco: CellDecoration | null = null;
  rules.forEach((rule, i) => {
    if (!inRect(rule.range, r, c)) return;
    if (rule.kind === "colorScale") {
      const mm = stats[i].minMax;
      const n = numAt(doc, r, c);
      if (!mm || n === null) return;
      const t = mm.max === mm.min ? 0.5 : (n - mm.min) / (mm.max - mm.min);
      const bg =
        rule.stops === 2
          ? mix(rule.colors[0], rule.colors[1], t)
          : t < 0.5
            ? mix(rule.colors[0], rule.colors[1], t * 2)
            : mix(rule.colors[1], rule.colors[2], (t - 0.5) * 2);
      deco = { ...deco, bg };
    } else if (rule.kind === "dataBar") {
      const mm = stats[i].minMax;
      const n = numAt(doc, r, c);
      if (!mm || n === null) return;
      const lo = Math.min(0, mm.min);
      const hi = Math.max(0, mm.max);
      const frac = hi === lo ? 0 : (n - lo) / (hi - lo);
      deco = { ...deco, bar: Math.max(0, Math.min(1, frac)), barColor: rule.color };
    } else if (rule.kind === "custom") {
      const raw = getCell(doc, r, c).trim();
      const x = raw === "" ? 0 : Number.isFinite(Number(raw)) ? Number(raw) : raw;
      const res = evaluateExpression(rule.expr, { x, value: x });
      if (!isError(res) && toBoolean(res)) deco = { ...deco, bg: rule.color };
    }
  });
  return deco;
}

/** Validate a custom rule expression; returns an error message or null. */
export function validateExpr(expr: string): string | null {
  const res = evaluateExpression(expr, { x: 0, value: 0 });
  return isError(res) ? res.reason ?? "Invalid expression" : null;
}
