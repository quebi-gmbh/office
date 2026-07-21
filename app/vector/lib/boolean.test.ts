import { describe, expect, test } from "bun:test";
import { greinerHormann, booleanNodes } from "./boolean";
import type { Point, RectNode } from "./types";

const square = (x: number, y: number, s: number): Point[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

function bounds(contours: Point[][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours)
    for (const [x, y] of c) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  return { minX, minY, maxX, maxY };
}

describe("greiner-hormann polygon clipping", () => {
  const a = square(0, 0, 10);
  const b = square(5, 5, 10);

  test("intersection is the overlap quadrant", () => {
    const r = greinerHormann(a, b, "intersect");
    expect(r.length).toBe(1);
    const bb = bounds(r);
    expect(bb.minX).toBeCloseTo(5, 1);
    expect(bb.minY).toBeCloseTo(5, 1);
    expect(bb.maxX).toBeCloseTo(10, 1);
    expect(bb.maxY).toBeCloseTo(10, 1);
  });

  test("union spans both squares", () => {
    const r = greinerHormann(a, b, "union");
    const bb = bounds(r);
    expect(bb.minX).toBeCloseTo(0, 1);
    expect(bb.minY).toBeCloseTo(0, 1);
    expect(bb.maxX).toBeCloseTo(15, 1);
    expect(bb.maxY).toBeCloseTo(15, 1);
  });

  test("subtract keeps only the A-not-B region", () => {
    const r = greinerHormann(a, b, "subtract");
    expect(r.length).toBeGreaterThanOrEqual(1);
    const bb = bounds(r);
    // Result must not extend past A.
    expect(bb.maxX).toBeLessThanOrEqual(10.01);
    expect(bb.maxY).toBeLessThanOrEqual(10.01);
    expect(bb.minX).toBeCloseTo(0, 1);
  });

  test("non-overlapping shapes yield no intersection contour", () => {
    const far = square(100, 100, 10);
    expect(greinerHormann(a, far, "intersect").length).toBe(0);
  });
});

describe("booleanNodes on rect nodes", () => {
  const rect = (id: string, x: number, y: number): RectNode => ({
    id, type: "rect", x, y, w: 10, h: 10, rx: 0, rotation: 0,
    fill: "#f00", stroke: null, strokeWidth: 1, opacity: 1,
  });

  test("union of two overlapping rects returns closed polyline(s)", () => {
    const out = booleanNodes([rect("a", 0, 0), rect("b", 5, 5)], "union");
    expect(out).not.toBeNull();
    expect(out!.length).toBeGreaterThanOrEqual(1);
    expect(out![0].type).toBe("polyline");
    expect((out![0] as { closed: boolean }).closed).toBe(true);
  });

  test("returns null with fewer than two polygons", () => {
    expect(booleanNodes([rect("a", 0, 0)], "union")).toBeNull();
  });
});
