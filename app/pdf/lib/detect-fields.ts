/**
 * Field auto-detection — propose form fields from a page's own printed
 * structure.
 *
 * Two detectors ship in this first cut, both aimed at classic printed forms:
 *
 * - **Rules** (vector): a long, thin, horizontal path is a fill-in line. The
 *   field sits *on* the line, extending upwards.
 * - **Underscore runs** (text): `Name: ______` is a fill-in line typed with the
 *   keyboard. The field spans the run's own x/width. Near-zero false positives.
 *
 * Names come from the nearest label — to the left on the same line first, then
 * above — slugified and deduped.
 *
 * Everything here is **pure**: it consumes plain geometry (see
 * {@link PageSignals}) rather than pdf.js objects, so it's testable without a
 * browser. `app/pdf/lib/page-signals.ts` is the adapter that reads those
 * signals off a real page.
 *
 * Detection never writes to the document — it emits {@link FieldDraft}s with
 * `status: "proposed"` into the same pending layer manual placement uses, so
 * every guess is reviewable (nudge / rename / retype / delete) before Apply.
 * That's what makes imperfect heuristics acceptable: a wrong guess costs a
 * click, not a corrupted document.
 */
import {
  fieldId, resolveFieldNames, slugifyFieldName, type FieldDraft,
} from "~/pdf/lib/form-fields";

// ── Input ────────────────────────────────────────────────────────────────────

/** One text run, in view space (origin top-left, y down, PDF points). */
export type TextSpan = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** One thin/rectangular vector path, in view space. */
export type RuleSpan = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Everything the detectors need to know about one page. */
export type PageSignals = {
  /** 0-based page index. */
  page: number;
  /** View size (rotation applied), in points. */
  width: number;
  height: number;
  texts: TextSpan[];
  /** Axis-aligned bounding boxes of the page's vector paths. */
  rules: RuleSpan[];
};

export type DetectOptions = {
  /** Shortest horizontal rule that can become a field, in points. */
  minRuleWidth: number;
  /** Thickest rule still considered a line rather than a filled block. */
  maxRuleThickness: number;
  /** Longest rule we'll trust — anything wider is usually a page divider. */
  maxRuleWidthRatio: number;
  /** Height given to a detected text field, in points. */
  fieldHeight: number;
  /** Shortest underscore run that counts, in characters. */
  minUnderscores: number;
  /** How far left of a field we'll look for its label, in points. */
  labelReach: number;
};

export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  minRuleWidth: 34,
  maxRuleThickness: 2.6,
  maxRuleWidthRatio: 0.94,
  fieldHeight: 15,
  minUnderscores: 3,
  labelReach: 190,
};

// ── Operator-list replay ─────────────────────────────────────────────────────

/** A 2D affine matrix, pdf.js order: `[a, b, c, d, e, f]`. */
export type Matrix = [number, number, number, number, number, number];

/** `m1 · m2` — the same composition pdf.js' `Util.transform` performs. */
export function matMul(m1: readonly number[], m2: readonly number[]): Matrix {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!,
  ];
}

/** Axis-aligned bounds of `[x0, y0, x1, y1]` after `m`. */
export function transformedBounds(
  rect: ArrayLike<number>,
  m: readonly number[],
): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [
    [rect[0]!, rect[1]!], [rect[2]!, rect[1]!],
    [rect[0]!, rect[3]!], [rect[2]!, rect[3]!],
  ]) {
    xs.push(m[0]! * px + m[2]! * py + m[4]!);
    ys.push(m[1]! * px + m[3]! * py + m[5]!);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The subset of pdf.js' `OPS` the replay cares about. */
export type OpCodes = {
  save: number;
  restore: number;
  transform: number;
  setLineWidth: number;
  constructPath: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginAnnotation: number;
  endAnnotation: number;
  /** Paint ops that stroke (so the path box has to grow by the line width). */
  strokeOps: number[];
};

export type ReplayLimits = { maxOps?: number; maxRules?: number };

/**
 * Replay a pdf.js operator list far enough to know where each path landed.
 *
 * Only what moves geometry is tracked: the CTM (`transform`, `save`, `restore`,
 * form XObjects) and the line width — a stroked horizontal line has a
 * zero-height box until you add its width back. Content inside an existing
 * annotation's appearance stream is skipped: a widget that's already there
 * isn't a blank waiting to be filled.
 *
 * Pure on purpose — pdf.js hands us `fnArray`/`argsArray` and the viewport
 * matrix, and everything after that is arithmetic we can test.
 */
export function rulesFromOperatorList(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  ops: OpCodes,
  baseTransform: readonly number[],
  limits: ReplayLimits = {},
): RuleSpan[] {
  const maxOps = limits.maxOps ?? 160_000;
  const maxRules = limits.maxRules ?? 4_000;
  const strokeOps = new Set(ops.strokeOps);

  let ctm = [...baseTransform] as Matrix;
  let lineWidth = 1;
  const stack: { ctm: Matrix; lineWidth: number }[] = [];
  let annotationDepth = 0;
  const out: RuleSpan[] = [];

  const push = () => stack.push({ ctm, lineWidth });
  const pop = () => {
    const prev = stack.pop();
    if (prev) {
      ctm = prev.ctm;
      lineWidth = prev.lineWidth;
    }
  };

  const limit = Math.min(fnArray.length, maxOps);
  for (let i = 0; i < limit; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | undefined;
    switch (fn) {
      case ops.save:
        push();
        break;
      case ops.restore:
        pop();
        break;
      case ops.transform:
        if (args && args.length >= 6) ctm = matMul(ctm, args as number[]);
        break;
      case ops.setLineWidth:
        if (typeof args?.[0] === "number") lineWidth = args[0];
        break;
      case ops.paintFormXObjectBegin:
        push();
        if (args && Array.isArray(args[0])) ctm = matMul(ctm, args[0] as number[]);
        break;
      case ops.paintFormXObjectEnd:
        pop();
        break;
      case ops.beginAnnotation:
        push();
        annotationDepth++;
        break;
      case ops.endAnnotation:
        annotationDepth--;
        pop();
        break;
      case ops.constructPath: {
        if (annotationDepth > 0 || out.length >= maxRules) break;
        const minMax = args?.[2] as ArrayLike<number> | undefined;
        if (!minMax || minMax.length < 4) break;
        let [x1, y1, x2, y2] = transformedBounds(minMax, ctm);
        if (![x1, y1, x2, y2].every(Number.isFinite)) break;
        if (strokeOps.has(args![0] as number)) {
          // The box is the path's centre line; a stroke straddles it.
          const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
          const half = Math.max(0.25, (lineWidth * scale) / 2);
          x1 -= half; y1 -= half; x2 += half; y2 += half;
        }
        out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** The bits of a pdf.js `TextItem` the conversion below needs. */
export type TextItemLike = {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
};

/**
 * pdf.js text items → view-space boxes.
 *
 * Each item's transform is relative to PDF user space; composing it with the
 * viewport matrix puts the baseline origin in view space, and the text matrix's
 * scale gives the run's height. Text that doesn't read along the view's x-axis
 * is dropped: a rotated caption can't host a left-to-right field and makes a
 * poor label.
 */
export function textSpansFromItems(
  items: Iterable<TextItemLike>,
  viewportTransform: readonly number[],
): TextSpan[] {
  const out: TextSpan[] = [];
  for (const it of items) {
    if (typeof it.str !== "string" || it.str === "" || !it.transform) continue;
    const tx = matMul(viewportTransform, it.transform);
    if (Math.abs(Math.atan2(tx[1], tx[0])) >= 0.08) continue;
    const h = Math.hypot(tx[2], tx[3]) || it.height || 1;
    const w = it.width ?? 0;
    if (w <= 0) continue;
    // pdf.js hands us the baseline; the run's box starts a font-height above.
    out.push({ str: it.str, x: tx[4], y: tx[5] - h, w, h });
  }
  return out;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number };

function overlap1d(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function intersectionArea(a: Rect, b: Rect): number {
  return overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) *
    overlap1d(a.y, a.y + a.h, b.y, b.y + b.h);
}

/** Intersection over the *smaller* box — catches "one contains the other". */
export function overlapRatio(a: Rect, b: Rect): number {
  const inter = intersectionArea(a, b);
  if (inter === 0) return 0;
  const smallest = Math.min(a.w * a.h, b.w * b.h);
  return smallest > 0 ? inter / smallest : 0;
}

/**
 * Join rules that are really one line chopped into segments: same y (within
 * `tol`), same thickness, and touching or nearly touching horizontally.
 */
export function mergeRules(rules: RuleSpan[], tol = 1.5, gap = 4): RuleSpan[] {
  const sorted = [...rules].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const out: RuleSpan[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.y - r.y) <= tol &&
      Math.abs(prev.h - r.h) <= tol &&
      r.x <= prev.x + prev.w + gap &&
      r.x + r.w >= prev.x - gap
    ) {
      const x = Math.min(prev.x, r.x);
      const right = Math.max(prev.x + prev.w, r.x + r.w);
      out[out.length - 1] = { x, y: Math.min(prev.y, r.y), w: right - x, h: Math.max(prev.h, r.h) };
      continue;
    }
    out.push({ ...r });
  }
  return out;
}

// ── Label inference ──────────────────────────────────────────────────────────

const TRAILING_PUNCT = /[\s:：.·_\-–—>*]+$/;
const LEADING_PUNCT = /^[\s:：.·_\-–—<*]+/;

/** Strip the decoration a form label carries (`"Name: ____"` → `"Name"`). */
export function cleanLabel(raw: string): string {
  return raw.replace(/_+/g, " ").replace(TRAILING_PUNCT, "").replace(LEADING_PUNCT, "").trim();
}

/**
 * Best label for a field box: the nearest text to its left on the same line,
 * else the nearest text directly above it. Returns null when nothing plausible
 * is in reach.
 */
export function inferLabel(
  rect: Rect,
  texts: TextSpan[],
  reach: number,
): string | null {
  const midY = rect.y + rect.h / 2;
  let best: { text: string; score: number } | null = null;

  for (const t of texts) {
    const label = cleanLabel(t.str);
    if (!label || !/[a-z0-9]/i.test(label)) continue;
    const right = t.x + t.w;
    const bottom = t.y + t.h;

    // Same line, to the left.
    const sameLine = midY >= t.y - 2 && midY <= bottom + 2;
    if (sameLine && right <= rect.x + 2 && rect.x - right <= reach) {
      const score = 1000 - (rect.x - right);
      if (!best || score > best.score) best = { text: label, score };
      continue;
    }
    // Directly above, overlapping horizontally.
    const above = bottom <= rect.y + 2 && rect.y - bottom <= 22;
    const shares = overlap1d(t.x, right, rect.x, rect.x + rect.w) > Math.min(rect.w, t.w) * 0.3;
    if (above && shares) {
      const score = 500 - (rect.y - bottom);
      if (!best || score > best.score) best = { text: label, score };
    }
  }
  return best?.text ?? null;
}

// ── Detectors ────────────────────────────────────────────────────────────────

/** A proposal before naming/dedup — the shape both detectors emit. */
type Candidate = Rect & {
  source: "rule" | "underscore";
  label: string | null;
};

/**
 * Underscore runs: `Name: ______`. The run's own x/width give the field's
 * horizontal extent (interpolated across the span by character count, which is
 * accurate enough for the monospace-ish runs underscores produce), and the
 * field sits on the run's baseline.
 */
export function detectUnderscoreRuns(
  signals: PageSignals,
  opts: DetectOptions,
): Candidate[] {
  const out: Candidate[] = [];
  const re = new RegExp(`_{${Math.max(2, opts.minUnderscores)},}`, "g");
  for (const span of signals.texts) {
    if (span.w <= 0 || !span.str.includes("_")) continue;
    const len = span.str.length;
    if (len === 0) continue;
    const perChar = span.w / len;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(span.str)) !== null) {
      const x = span.x + m.index * perChar;
      const w = m[0].length * perChar;
      if (w < opts.minRuleWidth * 0.5) continue;
      const h = Math.max(opts.fieldHeight, span.h * 1.25);
      // The underscore glyph sits just below the baseline — the field grows up
      // from the bottom of the span.
      const bottom = span.y + span.h;
      // `Name: ______` puts the label in the same run as the blank, where the
      // left-of-the-field search can't see it. Take whatever precedes the run
      // (after any earlier run in the same line) as the label.
      const prefix = cleanLabel(span.str.slice(0, m.index).split(/_{2,}/).pop() ?? "");
      out.push({
        x, y: bottom - h, w, h,
        source: "underscore",
        label: prefix && /[a-z0-9]/i.test(prefix) ? prefix : null,
      });
    }
  }
  return out;
}

/**
 * Horizontal rules: long, thin, axis-aligned paths. The field rests on the
 * line, so its bottom edge is the line's top edge.
 *
 * Two filters keep the noise down: a rule spanning almost the whole page is a
 * divider, not a blank; and a rule with printed text sitting on it is
 * underlining that text rather than waiting for input.
 */
export function detectRules(
  signals: PageSignals,
  opts: DetectOptions,
): Candidate[] {
  const merged = mergeRules(signals.rules);
  const maxWidth = signals.width * opts.maxRuleWidthRatio;
  const out: Candidate[] = [];
  for (const r of merged) {
    if (r.h > opts.maxRuleThickness) continue;
    if (r.w < opts.minRuleWidth || r.w > maxWidth) continue;
    // Header/footer separators.
    if (r.y < signals.height * 0.04 || r.y > signals.height * 0.97) continue;

    const h = opts.fieldHeight;
    const rect: Rect = { x: r.x + 1, y: r.y - h, w: Math.max(0, r.w - 2), h };
    if (rect.w < opts.minRuleWidth || rect.y < 0) continue;

    // An underline *of* text, not a blank waiting for text.
    const covered = signals.texts.some((t) => {
      const share = overlap1d(t.x, t.x + t.w, rect.x, rect.x + rect.w);
      const vertical = overlap1d(t.y, t.y + t.h, rect.y, rect.y + rect.h);
      return vertical > rect.h * 0.35 && share > rect.w * 0.45;
    });
    if (covered) continue;

    out.push({ ...rect, source: "rule", label: null });
  }
  return out;
}

// ── Public entry point ───────────────────────────────────────────────────────

export type DetectResult = {
  fields: FieldDraft[];
  /** Candidates dropped because they duplicated a stronger one. */
  duplicates: number;
};

/**
 * Detect field candidates across `pages` and return them as pending drafts.
 *
 * `existingNames` (the document's current AcroForm field names, plus anything
 * already pending) keeps generated names from colliding with what's there.
 */
export function detectFields(
  pages: PageSignals[],
  opts: Partial<DetectOptions> = {},
  existingNames: Iterable<string> = [],
): DetectResult {
  const o = { ...DEFAULT_DETECT_OPTIONS, ...opts };
  const drafts: FieldDraft[] = [];
  let duplicates = 0;

  for (const signals of pages) {
    // Underscore runs first: when both detectors fire on the same blank (a
    // typed underline *and* a drawn rule), the text-derived one is the better
    // measurement, so it wins the dedup below.
    const candidates = [
      ...detectUnderscoreRuns(signals, o),
      ...detectRules(signals, o),
    ];

    const kept: Candidate[] = [];
    for (const c of candidates) {
      if (c.w < o.minRuleWidth * 0.5 || c.h < 6) continue;
      if (kept.some((k) => overlapRatio(k, c) > 0.5)) {
        duplicates++;
        continue;
      }
      kept.push(c);
    }

    // Reading order — this is also the tab order the widgets get written in.
    kept.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    for (const c of kept) {
      // A detector that already knows the label (an underscore run carries its
      // own) wins; everything else looks around the page.
      const label = c.label ?? inferLabel(c, signals.texts, o.labelReach);
      drafts.push({
        id: fieldId(),
        page: signals.page,
        kind: "text",
        name: slugifyFieldName(label ?? "field"),
        x: round2(c.x),
        y: round2(c.y),
        w: round2(c.w),
        h: round2(c.h),
        source: c.source,
        status: "proposed",
        label,
      });
    }
  }

  return { fields: resolveFieldNames(drafts, existingNames), duplicates };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
