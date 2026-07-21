import { describe, expect, test } from "bun:test";
import {
  chainLoops,
  ensureCCW,
  extrudeMatrix,
  planeBasis,
  profilesFromSketch,
  signedArea,
  tessellateCircle,
} from "./geometry";
import type { Sketch } from "./types";

function sketch(entities: Sketch["entities"]): Sketch {
  return { plane: "XY", entities, constraints: [] };
}

describe("plane frames", () => {
  test("XY basis is identity-ish", () => {
    const b = planeBasis("XY");
    expect(b.n).toEqual([0, 0, 1]);
  });

  test("extrude matrix is column-major with N in the 3rd column", () => {
    const m = extrudeMatrix("XZ");
    // 3rd column (indices 8,9,10) is the plane normal (0,-1,0).
    expect([m[8], m[9], m[10]]).toEqual([0, -1, 0]);
    expect(m[15]).toBe(1);
  });
});

describe("winding", () => {
  test("signed area of a CCW unit square is +1", () => {
    expect(signedArea([[0, 0], [1, 0], [1, 1], [0, 1]])).toBeCloseTo(1);
  });
  test("ensureCCW flips a CW polygon", () => {
    const cw: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(signedArea(ensureCCW(cw))).toBeGreaterThan(0);
  });
});

describe("profiles", () => {
  test("rectangle becomes one CCW profile", () => {
    const s = sketch([{ id: "r", type: "rect", x: 0, y: 0, w: 10, h: 5 }]);
    const p = profilesFromSketch(s);
    expect(p).toHaveLength(1);
    expect(signedArea(p[0])).toBeGreaterThan(0);
    expect(Math.abs(signedArea(p[0]))).toBeCloseTo(50);
  });

  test("circle profile encloses ~πr²", () => {
    const s = sketch([{ id: "c", type: "circle", cx: 0, cy: 0, r: 10 }]);
    const p = profilesFromSketch(s);
    expect(p).toHaveLength(1);
    // Tessellated area is slightly under the true circle area.
    expect(Math.abs(signedArea(p[0]))).toBeGreaterThan(300);
    expect(Math.abs(signedArea(p[0]))).toBeLessThan(315);
  });

  test("four lines chain into a closed loop", () => {
    const s = sketch([
      { id: "a", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
      { id: "b", type: "line", x1: 10, y1: 0, x2: 10, y2: 10 },
      { id: "c", type: "line", x1: 10, y1: 10, x2: 0, y2: 10 },
      { id: "d", type: "line", x1: 0, y1: 10, x2: 0, y2: 0 },
    ]);
    const p = profilesFromSketch(s);
    expect(p).toHaveLength(1);
    expect(Math.abs(signedArea(p[0]))).toBeCloseTo(100);
  });

  test("open chain produces no profile", () => {
    const loops = chainLoops([{ pts: [[0, 0], [1, 0]] }, { pts: [[1, 0], [2, 0]] }]);
    expect(loops).toHaveLength(0);
  });
});

test("tessellateCircle returns the requested segment count", () => {
  expect(tessellateCircle(0, 0, 5, 12)).toHaveLength(12);
});
