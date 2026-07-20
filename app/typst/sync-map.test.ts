import { describe, expect, test } from "bun:test";
import {
  buildSections,
  extractHeadings,
  fractionToOffset,
  offsetToFraction,
  sectionBand,
  sectionIndexForOffset,
} from "./sync-map";

describe("extractHeadings", () => {
  test("finds headings with levels and offsets", () => {
    const src = "= One\ntext\n\n== Two\nmore\n=== Three\n";
    const hs = extractHeadings(src);
    expect(hs.map((h) => [h.level, h.text])).toEqual([
      [1, "One"],
      [2, "Two"],
      [3, "Three"],
    ]);
    // First heading at offset 0; second after "= One\ntext\n\n"
    expect(hs[0].offset).toBe(0);
    expect(src.slice(hs[1].offset)).toStartWith("== Two");
    expect(src.slice(hs[2].offset)).toStartWith("=== Three");
  });

  test("ignores = inside fenced raw blocks", () => {
    const src = "= Real\n```\n= not a heading\n```\n== Also real\n";
    const hs = extractHeadings(src);
    expect(hs.map((h) => h.text)).toEqual(["Real", "Also real"]);
  });

  test("requires whitespace after = (so ==foo isn't a heading)", () => {
    expect(extractHeadings("==nope\n").length).toBe(0);
    expect(extractHeadings("== yep\n").length).toBe(1);
  });

  test("no headings → empty", () => {
    expect(extractHeadings("just prose\nmore prose\n")).toEqual([]);
  });
});

describe("buildSections", () => {
  test("covers [0, len) contiguously with a preamble", () => {
    const src = "intro\n= One\naaa\n= Two\nbbb";
    const secs = buildSections(src);
    expect(secs[0]).toMatchObject({ start: 0, level: 0 }); // preamble
    // contiguous, non-overlapping, ends at doc length
    for (let i = 1; i < secs.length; i++) {
      expect(secs[i].start).toBe(secs[i - 1].end);
    }
    expect(secs[secs.length - 1].end).toBe(src.length);
  });

  test("no headings → single full-document section", () => {
    const secs = buildSections("hello world");
    expect(secs.length).toBe(1);
    expect(secs[0]).toMatchObject({ start: 0, end: 11, level: 0 });
  });

  test("heading at offset 0 → no empty preamble", () => {
    const secs = buildSections("= Title\nbody");
    expect(secs.length).toBe(1);
    expect(secs[0].start).toBe(0);
  });
});

describe("fraction mapping", () => {
  test("offset↔fraction round-trips within rounding", () => {
    const len = 200;
    for (const off of [0, 50, 199, 200]) {
      const f = offsetToFraction(off, len);
      expect(fractionToOffset(f, len)).toBe(Math.min(off, len));
    }
  });

  test("clamps out-of-range", () => {
    expect(offsetToFraction(-10, 100)).toBe(0);
    expect(offsetToFraction(500, 100)).toBe(1);
    expect(fractionToOffset(2, 100)).toBe(100);
    expect(fractionToOffset(-1, 100)).toBe(0);
  });
});

describe("section lookup + band", () => {
  const src = "= A\n0123456789\n= B\nxyz";
  const secs = buildSections(src);

  test("sectionIndexForOffset lands in the right section", () => {
    expect(sectionIndexForOffset(secs, 0)).toBe(0);
    expect(sectionIndexForOffset(secs, 5)).toBe(0);
    const bStart = src.indexOf("= B");
    expect(sectionIndexForOffset(secs, bStart)).toBe(1);
    expect(sectionIndexForOffset(secs, src.length - 1)).toBe(1);
  });

  test("sectionBand is within [0,1] and ordered", () => {
    for (const s of secs) {
      const { top, bottom } = sectionBand(s, src.length);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(bottom).toBeLessThanOrEqual(1);
      expect(bottom).toBeGreaterThanOrEqual(top);
    }
  });
});
