/**
 * One coordinate basis for every preview → source jump.
 *
 * Typst emits each rendered page as a `<g class="typst-page">` carrying its
 * `data-page-width` / `data-page-height` in **points**. Both jump affordances
 * (clicking an internal reference, selecting preview text) resolve to a
 * `(1-based page, y in pt)` pair and are converted to a document fraction here,
 * so a click and a selection at the same spot always agree. Anything measured
 * in CSS pixels is converted through the page's own rendered scale first.
 */

import { clamp } from "./sync-map";

/** A point inside the rendered document: 1-based page + y offset in pt. */
export interface PageTarget {
  page: number;
  y: number;
}

/**
 * Map a page target onto a fraction [0, 1] of the whole document, using the
 * summed page heights (pt) as the vertical axis.
 */
export function pageTargetToFraction(
  pageHeights: number[],
  target: PageTarget,
): number {
  let total = 0;
  let before = 0;
  for (let i = 0; i < pageHeights.length; i++) {
    const h = pageHeights[i] > 0 ? pageHeights[i] : 0;
    if (i < target.page - 1) before += h;
    total += h;
  }
  if (total <= 0) return 0;
  return clamp((before + Math.max(0, target.y)) / total, 0, 1);
}

/**
 * The rendered page elements of a preview container, in document order.
 *
 * The two renderers disagree on markup: the SVG string carries
 * `<g class="typst-page" data-page-height="…">` groups, while the DOM
 * (selectable) renderer emits `<div class="typst-dom-page">` wrappers that
 * expose their size as `--data-page-*` custom properties. DOM pages win when
 * present — they *contain* svg page groups, so mixing the two would count every
 * page twice.
 */
export function pageElements(container: HTMLElement): HTMLElement[] {
  const domPages = Array.from(
    container.querySelectorAll<HTMLElement>(".typst-dom-page"),
  );
  if (domPages.length > 0) return domPages;
  return Array.from(container.querySelectorAll<HTMLElement>(".typst-page"));
}

/**
 * Height of one rendered page, in whatever unit that renderer reports (pt for
 * the SVG output, CSS px for the DOM one). Only ratios between pages are used,
 * and a preview never mixes renderers, so the unit cancels out.
 */
export function pageHeightOf(page: HTMLElement): number {
  const attr = page.getAttribute("data-page-height");
  if (attr) return parseFloat(attr) || 0;
  const varValue =
    page.style.getPropertyValue("--data-page-height") ||
    getComputedStyle(page).getPropertyValue("--data-page-height");
  return parseFloat(varValue) || 0;
}

/** Page heights, in document order. */
export function pageHeights(pages: HTMLElement[]): number[] {
  return pages.map(pageHeightOf);
}

/**
 * Last-resort basis for a preview point when no page reports a usable size:
 * the fraction of the scrollable content. Both jump paths share it so they
 * still agree with each other in that degenerate case.
 */
export function containerYToFraction(
  container: HTMLElement,
  clientY: number,
): number {
  const height = container.scrollHeight;
  if (height <= 0) return 0;
  const y =
    clientY - container.getBoundingClientRect().top + container.scrollTop;
  return clamp(y / height, 0, 1);
}

/**
 * Convert a viewport y coordinate into a page target, picking the page that
 * contains it (or the nearest one when the point falls in a page gap).
 * Returns `null` when the preview carries no measurable pages.
 */
export function clientYToPageTarget(
  pages: HTMLElement[],
  clientY: number,
): PageTarget | null {
  if (pages.length === 0) return null;
  let bestIdx = 0;
  let bestDist = Infinity;
  let bestRect: DOMRect | null = null;
  for (let i = 0; i < pages.length; i++) {
    const rect = pages[i].getBoundingClientRect();
    const dist =
      clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
      bestRect = rect;
    }
    if (dist === 0) break;
  }
  if (!bestRect) return null;
  const height = pageHeightOf(pages[bestIdx]);
  if (!(height > 0) || !(bestRect.height > 0)) return null;
  const scale = bestRect.height / height;
  return {
    page: bestIdx + 1,
    y: clamp((clientY - bestRect.top) / scale, 0, height),
  };
}
