/**
 * Column summary statistics for the insight panel. Computed on demand for the
 * focused column over a sample bounded for responsiveness.
 */
import { type TableDoc, getCell } from "./model";

export interface ColumnSummary {
  count: number;
  distinct: number;
  nulls: number;
  numeric: boolean;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  p25?: number;
  p75?: number;
  top: { value: string; count: number }[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function summarize(doc: TableDoc, col: number): ColumnSummary {
  const start = doc.hasHeader ? 1 : 0;
  const counts = new Map<string, number>();
  const nums: number[] = [];
  let count = 0;
  let nulls = 0;
  for (let r = start; r < doc.nRows; r++) {
    const v = getCell(doc, r, col);
    if (v.trim() === "") { nulls++; continue; }
    count++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
    const n = parseFloat(v.replace(/,/g, ""));
    if (Number.isFinite(n) && /^[\s$€£]*-?[\d.,]+%?[\s]*$/.test(v)) nums.push(n);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, c]) => ({ value, count: c }));

  const numeric = count > 0 && nums.length >= count * 0.8;
  const s: ColumnSummary = { count, distinct: counts.size, nulls, numeric, top };
  if (numeric && nums.length) {
    const sorted = nums.slice().sort((a, b) => a - b);
    s.min = sorted[0];
    s.max = sorted[sorted.length - 1];
    s.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    s.median = quantile(sorted, 0.5);
    s.p25 = quantile(sorted, 0.25);
    s.p75 = quantile(sorted, 0.75);
  }
  return s;
}
