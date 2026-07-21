/**
 * Split a combined Typst SVG (one `<svg>` with shared `<defs>` and several
 * `<g class="typst-page">` groups stacked vertically) into standalone per-page
 * SVG strings. Each page keeps the shared defs and is repositioned to the
 * origin with its own viewBox, so it renders on its own.
 *
 * Pure string manipulation (no DOM) so it's unit-testable and works anywhere.
 */

const PAGE_OPEN = '<g class="typst-page"';

/** Extract the balanced `<g …>…</g>` starting at `start` (an index of `<g`). */
function extractBalancedGroup(svg: string, start: number): string | null {
  const tag = /<(\/?)g\b[^>]*?(\/?)>/g;
  tag.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(svg))) {
    const isClose = m[1] === "/";
    const isSelfClose = m[2] === "/";
    if (isClose) depth--;
    else if (!isSelfClose) depth++;
    if (depth === 0) return svg.slice(start, tag.lastIndex);
  }
  return null;
}

export interface SvgPage {
  svg: string;
  width: number;
  height: number;
}

/** Split a combined Typst SVG into one standalone SVG per page. */
export function splitSvgPages(combined: string): SvgPage[] {
  // Shared defs blocks (they don't nest).
  const defs = combined.match(/<defs[\s\S]*?<\/defs>/g)?.join("") ?? "";

  const pages: SvgPage[] = [];
  let idx = combined.indexOf(PAGE_OPEN);
  while (idx !== -1) {
    const group = extractBalancedGroup(combined, idx);
    if (!group) break;
    const width = parseFloat(/data-page-width="([\d.]+)"/.exec(group)?.[1] ?? "0");
    const height = parseFloat(
      /data-page-height="([\d.]+)"/.exec(group)?.[1] ?? "0",
    );
    // Reposition the page to the origin (its combined transform stacks pages).
    const atOrigin = group.replace(
      /^(<g class="typst-page"[^>]*?)transform="[^"]*"/,
      '$1transform="translate(0, 0)"',
    );
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `xmlns:h5="http://www.w3.org/1999/xhtml" ` +
      `viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
      defs +
      atOrigin +
      `</svg>`;
    pages.push({ svg, width, height });
    idx = combined.indexOf(PAGE_OPEN, idx + group.length);
  }
  return pages;
}

/** Number of pages in a combined Typst SVG (cheap; no splitting). */
export function countPages(combined: string): number {
  return (combined.match(/class="typst-page"/g) ?? []).length;
}
