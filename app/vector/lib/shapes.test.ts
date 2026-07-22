import { describe, expect, test } from "bun:test";
import { polygonPoints, starPoints, arcPoints, spiralPoints, makeParametricShape, DEFAULT_SHAPE_PARAMS } from "./shapes";
import { DEFAULT_STYLE } from "./engine";
import type { Point } from "./types";

const e = { cx: 0, cy: 0, rx: 10, ry: 10 };

describe("parametric shapes", () => {
  test("polygon has N vertices within the bbox", () => {
    const p = polygonPoints(e, 5);
    expect(p).toHaveLength(5);
    for (const [x, y] of p) expect(Math.hypot(x, y)).toBeCloseTo(10, 5);
  });

  test("polygon clamps to at least 3 sides", () => {
    expect(polygonPoints(e, 2)).toHaveLength(3);
  });

  test("star has 2×points vertices alternating radius", () => {
    const p = starPoints(e, 5, 0.5);
    expect(p).toHaveLength(10);
    const r = (pt: Point) => Math.hypot(pt[0], pt[1]);
    expect(r(p[0])).toBeCloseTo(10, 5); // outer
    expect(r(p[1])).toBeCloseTo(5, 5); // inner
  });

  test("arc is an open sampled poly-line", () => {
    const p = arcPoints(e, 0, 270, 12);
    expect(p).toHaveLength(13);
  });

  test("spiral grows from centre outward", () => {
    const p = spiralPoints(e, 3, 16);
    expect(Math.hypot(p[0][0], p[0][1])).toBeCloseTo(0, 5);
    const last = p[p.length - 1];
    expect(Math.hypot(last[0], last[1])).toBeCloseTo(10, 5);
  });

  test("makeParametricShape builds closed polygon / open arc", () => {
    const poly = makeParametricShape("polygon", [0, 0], [20, 20], DEFAULT_STYLE, DEFAULT_SHAPE_PARAMS);
    expect(poly.type).toBe("polyline");
    expect((poly as { closed: boolean }).closed).toBe(true);
    const arc = makeParametricShape("arc", [0, 0], [20, 20], DEFAULT_STYLE, DEFAULT_SHAPE_PARAMS);
    expect((arc as { closed: boolean }).closed).toBe(false);
    expect(arc.fill).toBeNull();
  });
});
