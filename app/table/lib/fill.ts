/**
 * Fill-handle series detection. Given the values in the dragged source cells,
 * produce `count` continuation values. Handles numeric runs, dates, weekday and
 * month names, and "prefix + padded number" patterns (item-001 → item-002).
 * Falls back to repeating the source values (copy fill).
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAYS_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function matchList(values: string[], list: string[]): { idx: number; step: number } | null {
  const idxs = values.map((v) => list.indexOf(v.trim().toLowerCase()));
  if (idxs.some((i) => i < 0)) return null;
  const step = idxs.length >= 2 ? idxs[1] - idxs[0] : 1;
  if (idxs.length >= 2) {
    for (let i = 1; i < idxs.length; i++) {
      // allow wrap-around difference
      const d = (((idxs[i] - idxs[i - 1]) % list.length) + list.length) % list.length;
      const s = (((step) % list.length) + list.length) % list.length;
      if (d !== s) return null;
    }
  }
  return { idx: idxs[idxs.length - 1], step: step === 0 ? 1 : step };
}

function casePreserve(sample: string, word: string): string {
  if (sample === sample.toUpperCase()) return word.toUpperCase();
  if (sample[0] === sample[0]?.toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

const NUM_RE = /^-?\d+(?:\.\d+)?$/;
const PADDED_RE = /^(.*?)(\d+)(\D*)$/;

/** Produce `count` fill values continuing the `source` series. */
export function fillSeries(source: string[], count: number): string[] {
  const out: string[] = [];
  const nonEmpty = source.filter((s) => s.trim() !== "");
  if (nonEmpty.length === 0 || count <= 0) {
    for (let i = 0; i < count; i++) out.push(source[i % source.length] ?? "");
    return out;
  }

  // Pure numeric run.
  if (source.every((s) => NUM_RE.test(s.trim()))) {
    const nums = source.map((s) => parseFloat(s));
    const step = nums.length >= 2 ? nums[1] - nums[0] : 1;
    const consistent = nums.every((n, i) => i === 0 || Math.abs(n - nums[i - 1] - step) < 1e-9);
    let last = nums[nums.length - 1];
    const s = consistent ? step : 1;
    for (let i = 0; i < count; i++) {
      last += s;
      out.push(Number.isInteger(last) ? String(last) : String(+last.toFixed(10)));
    }
    return out;
  }

  // Weekday / month names.
  for (const list of [WEEKDAYS, WEEKDAYS_SHORT, MONTHS, MONTHS_SHORT]) {
    const m = matchList(source, list);
    if (m) {
      let idx = m.idx;
      for (let i = 0; i < count; i++) {
        idx = (((idx + m.step) % list.length) + list.length) % list.length;
        out.push(casePreserve(source[source.length - 1], list[idx]));
      }
      return out;
    }
  }

  // ISO dates.
  if (source.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim()))) {
    const days = source.map((s) => Date.parse(s + "T00:00:00") / 86400000);
    const step = days.length >= 2 ? Math.round(days[1] - days[0]) : 1;
    let last = days[days.length - 1];
    for (let i = 0; i < count; i++) {
      last += step || 1;
      out.push(new Date(last * 86400000).toISOString().slice(0, 10));
    }
    return out;
  }

  // Prefix + padded number (item-001 → item-002).
  const parsed = source.map((s) => PADDED_RE.exec(s.trim()));
  if (parsed.every((p, i) => p && (i === 0 || p[1] === parsed[0]![1] && p[3] === parsed[0]![3]))) {
    const nums = parsed.map((p) => parseInt(p![2], 10));
    const width = parsed[parsed.length - 1]![2].length;
    const step = nums.length >= 2 ? nums[1] - nums[0] : 1;
    const prefix = parsed[parsed.length - 1]![1];
    const suffix = parsed[parsed.length - 1]![3];
    let last = nums[nums.length - 1];
    for (let i = 0; i < count; i++) {
      last += step || 1;
      out.push(`${prefix}${String(last).padStart(width, "0")}${suffix}`);
    }
    return out;
  }

  // Fallback: repeat the source values (copy fill).
  for (let i = 0; i < count; i++) out.push(source[i % source.length]);
  return out;
}
