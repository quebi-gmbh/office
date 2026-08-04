import { describe, expect, test } from "bun:test";
import { pageTargetToFraction } from "./preview-coords";

describe("pageTargetToFraction", () => {
  const heights = [100, 100, 100];

  test("maps a point on the first page into the first third", () => {
    expect(pageTargetToFraction(heights, { page: 1, y: 0 })).toBe(0);
    expect(pageTargetToFraction(heights, { page: 1, y: 50 })).toBeCloseTo(
      1 / 6,
    );
  });

  test("accounts for the pages above the target", () => {
    expect(pageTargetToFraction(heights, { page: 2, y: 0 })).toBeCloseTo(1 / 3);
    expect(pageTargetToFraction(heights, { page: 3, y: 100 })).toBe(1);
  });

  test("handles pages of differing heights", () => {
    expect(pageTargetToFraction([200, 100], { page: 2, y: 50 })).toBeCloseTo(
      250 / 300,
    );
  });

  test("clamps out-of-range targets", () => {
    expect(pageTargetToFraction(heights, { page: 9, y: 0 })).toBe(1);
    expect(pageTargetToFraction(heights, { page: 1, y: -50 })).toBe(0);
  });

  test("degenerates to 0 without measurable pages", () => {
    expect(pageTargetToFraction([], { page: 1, y: 10 })).toBe(0);
    expect(pageTargetToFraction([0, 0], { page: 2, y: 10 })).toBe(0);
  });
});
