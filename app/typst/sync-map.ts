/**
 * Section mapping for editor ↔ preview scroll sync.
 *
 * Exact heading-to-preview-position mapping isn't reliably available from
 * typst.ts in the browser (spans/positions are resolved server-side in the
 * real tools). So this uses a *proportional* model anchored on the document's
 * headings: a character offset in the source maps to a fraction of the source,
 * which maps to the same fraction of the preview's scroll range. Headings only
 * define the boundaries of the highlighted "section band" — the mapping itself
 * is proportional. Coarse but robust, and it degrades gracefully.
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

/**
 * Extract top-level-ish headings from Typst source. Best-effort and
 * deliberately simple: a line beginning with one or more `=` followed by
 * whitespace and text. Lines inside raw blocks (```) are skipped so fenced
 * code doesn't produce phantom headings.
 */
export function extractHeadings(source: string): Heading[] {
  const headings: Heading[] = [];
  let offset = 0;
  let inRawFence = false;
  const lines = source.split("\n");
  for (const line of lines) {
    const fence = line.trimStart().startsWith("```");
    if (fence) inRawFence = !inRawFence;
    else if (!inRawFence) {
      const m = HEADING_RE.exec(line);
      if (m) {
        const leadingWs = line.length - line.trimStart().length;
        headings.push({
          offset: offset + leadingWs,
          level: m[1].length,
          text: m[2].trim(),
        });
      }
    }
    offset += line.length + 1; // +1 for the split "\n"
  }
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

/** Find the section (index) whose fraction range contains `fraction`. */
export function sectionIndexForFraction(
  sections: Section[],
  fraction: number,
  docLength: number,
): number {
  return sectionIndexForOffset(sections, fractionToOffset(fraction, docLength));
}

/**
 * The preview-scroll band [topFraction, bottomFraction] for a section — the
 * region to highlight. Both in [0, 1].
 */
export function sectionBand(
  section: Section,
  docLength: number,
): { top: number; bottom: number } {
  return {
    top: offsetToFraction(section.start, docLength),
    bottom: offsetToFraction(section.end, docLength),
  };
}
