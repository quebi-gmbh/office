/**
 * Section mapping used to resolve a *jump target* from the preview back into
 * the source.
 *
 * Exact position mapping isn't reliably available from typst.ts in the browser
 * (spans/positions are resolved server-side in the real tools), so a preview
 * position is turned into a fraction of the document and then into the nearest
 * heading-delimited section. That approximation is only ever paid on an
 * explicit user gesture (clicking a reference, selecting preview text) — there
 * is deliberately no continuous viewport sync built on top of it, because the
 * mapping is far too coarse to survive being applied every frame.
 *
 * All functions here are pure and unit-tested; the DOM wiring lives in the
 * editor component.
 */

export interface Heading {
  /** Character offset of the heading marker in the source. */
  offset: number;
  /** Heading depth (number of leading `=`). */
  level: number;
  /** Trimmed heading text (for debugging / potential UI). */
  text: string;
}

export interface Section {
  /** Source char offset where the section starts (its heading, or 0). */
  start: number;
  /** Source char offset where the next section starts (or docLength). */
  end: number;
  level: number;
  text: string;
}

const HEADING_RE = /^(=+)[ \t]+(.+)$/;
const FENCE_RE = /^`{3,}/;

/**
 * Extract top-level-ish headings from Typst source. Best-effort and
 * deliberately simple: a line beginning with one or more `=` followed by
 * whitespace and text. Lines inside raw blocks (```) are skipped so fenced
 * code doesn't produce phantom headings.
 *
 * Fence tracking is deliberately forgiving:
 *  - a fence closes only on a run of at least as many backticks as opened it,
 *  - a fence that opens and closes on the same line (`` ```rs let x = 1``` ``)
 *    doesn't open a block,
 *  - an *unterminated* fence is treated as ordinary text rather than swallowing
 *    every heading to the end of the document.
 */
export function extractHeadings(source: string): Heading[] {
  const headings: Heading[] = [];
  // Headings hidden by the currently-open fence. If that fence never closes it
  // wasn't a fence at all, so they get restored at EOF.
  let suppressed: Heading[] = [];
  let offset = 0;
  let fenceLen = 0; // 0 → not inside a raw block
  const lines = source.split("\n");
  for (const line of lines) {
    const trimmed = line.trimStart();
    const leadingWs = line.length - trimmed.length;
    const fence = FENCE_RE.exec(trimmed);
    if (fenceLen === 0) {
      if (fence) {
        // Opening a block only counts when it isn't closed on the same line —
        // by a run at least as long as the opener, matching the close rule.
        const rest = trimmed.slice(fence[0].length);
        const closesHere = new RegExp("`{" + fence[0].length + ",}").test(rest);
        if (!closesHere) {
          fenceLen = fence[0].length;
          suppressed = [];
        }
      } else {
        const m = HEADING_RE.exec(line);
        if (m) {
          headings.push({
            offset: offset + leadingWs,
            level: m[1].length,
            text: m[2].trim(),
          });
        }
      }
    } else if (fence && fence[0].length >= fenceLen) {
      fenceLen = 0;
      suppressed = [];
    } else {
      const m = HEADING_RE.exec(line);
      if (m) {
        suppressed.push({
          offset: offset + leadingWs,
          level: m[1].length,
          text: m[2].trim(),
        });
      }
    }
    offset += line.length + 1; // +1 for the split "\n"
  }
  // Unbalanced fence: don't let it eat the rest of the document.
  if (fenceLen !== 0 && suppressed.length > 0) headings.push(...suppressed);
  return headings;
}

/** Build contiguous sections spanning [0, docLength) from headings. */
export function buildSections(source: string): Section[] {
  const docLength = Math.max(1, source.length);
  const headings = extractHeadings(source);
  if (headings.length === 0) {
    return [{ start: 0, end: docLength, level: 0, text: "" }];
  }
  const sections: Section[] = [];
  // Preamble before the first heading, if any.
  if (headings[0].offset > 0) {
    sections.push({
      start: 0,
      end: headings[0].offset,
      level: 0,
      text: "",
    });
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const end = i + 1 < headings.length ? headings[i + 1].offset : docLength;
    sections.push({ start: h.offset, end, level: h.level, text: h.text });
  }
  return sections;
}

/** Clamp a number to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Map a source char offset to a fraction [0, 1] of the document. */
export function offsetToFraction(offset: number, docLength: number): number {
  if (docLength <= 0) return 0;
  return clamp(offset / docLength, 0, 1);
}

/** Map a fraction [0, 1] back to a source char offset. */
export function fractionToOffset(fraction: number, docLength: number): number {
  return Math.round(clamp(fraction, 0, 1) * docLength);
}

/** Find the section (index) containing a given source char offset. */
export function sectionIndexForOffset(
  sections: Section[],
  offset: number,
): number {
  for (let i = 0; i < sections.length; i++) {
    if (offset >= sections[i].start && offset < sections[i].end) return i;
  }
  return sections.length - 1;
}

/**
 * `buildSections` memoised on the exact source string.
 *
 * Splitting + regexing a whole document is far too expensive to redo on every
 * keystroke, and the section map is only ever consulted on an explicit jump —
 * so callers resolve it lazily through this cache instead of recomputing it in
 * an effect. One slot is enough: there is a single document on screen.
 */
let sectionCache: { source: string; sections: Section[] } | null = null;

export function sectionsForSource(source: string): Section[] {
  if (sectionCache && sectionCache.source === source) return sectionCache.sections;
  const sections = buildSections(source);
  sectionCache = { source, sections };
  return sections;
}
