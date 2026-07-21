import { describe, expect, test } from "bun:test";
import { countPages, splitSvgPages } from "./svg-pages";

// A minimal stand-in for typst's SVG: shared defs + two stacked page groups,
// each with nested <g> and self-referencing <use>.
const COMBINED =
  `<svg viewBox="0 0 100 200" width="100" height="200">` +
  `<defs><path id="g1" d="M0 0"/></defs>` +
  `<g class="typst-page" transform="translate(0, 0)" data-page-width="100" data-page-height="100">` +
  `<g class="typst-group"><use xlink:href="#g1"/></g>` +
  `</g>` +
  `<g class="typst-page" transform="translate(0, 100)" data-page-width="100" data-page-height="100">` +
  `<g class="typst-group"><g><use xlink:href="#g1"/></g></g>` +
  `</g>` +
  `</svg>`;

describe("svg-pages", () => {
  test("countPages counts typst-page groups", () => {
    expect(countPages(COMBINED)).toBe(2);
    expect(countPages("<svg></svg>")).toBe(0);
  });

  test("splitSvgPages yields one standalone svg per page", () => {
    const pages = splitSvgPages(COMBINED);
    expect(pages.length).toBe(2);
    for (const p of pages) {
      expect(p.width).toBe(100);
      expect(p.height).toBe(100);
      // Standalone + well-formed.
      expect((p.svg.match(/<svg/g) ?? []).length).toBe(1);
      expect(p.svg.trimEnd().endsWith("</svg>")).toBe(true);
      // Balanced <g> tags.
      expect((p.svg.match(/<g\b/g) ?? []).length).toBe(
        (p.svg.match(/<\/g>/g) ?? []).length,
      );
      // Carries the shared defs and exactly one page.
      expect(p.svg).toContain('id="g1"');
      expect((p.svg.match(/class="typst-page"/g) ?? []).length).toBe(1);
      // Repositioned to the origin.
      expect(p.svg).toContain('transform="translate(0, 0)"');
    }
    // The second page's viewBox is its own size, not the combined height.
    expect(pages[1].svg).toContain('viewBox="0 0 100 100"');
  });

  test("no pages → empty array", () => {
    expect(splitSvgPages("<svg><defs></defs></svg>")).toEqual([]);
  });
});
