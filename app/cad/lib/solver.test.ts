import { describe, expect, test } from "bun:test";
import { solveSketch, sketchDof } from "./solver";
import type { Sketch } from "./types";

describe("constraint solver", () => {
  test("horizontal constraint levels a line", () => {
    const s: Sketch = {
      plane: "XY",
      entities: [{ id: "l", type: "line", x1: 0, y1: 0, x2: 10, y2: 4 }],
      constraints: [{ id: "c", type: "horizontal", entity: "l" }],
    };
    const r = solveSketch(s);
    const line = r.sketch.entities[0];
    if (line.type !== "line") throw new Error("expected line");
    expect(line.y2).toBeCloseTo(line.y1, 4);
    expect(r.converged).toBe(true);
  });

  test("vertical constraint aligns a line", () => {
    const s: Sketch = {
      plane: "XY",
      entities: [{ id: "l", type: "line", x1: 0, y1: 0, x2: 3, y2: 10 }],
      constraints: [{ id: "c", type: "vertical", entity: "l" }],
    };
    const line = solveSketch(s).sketch.entities[0];
    if (line.type !== "line") throw new Error("expected line");
    expect(line.x2).toBeCloseTo(line.x1, 4);
  });

  test("coincident constraint joins two endpoints", () => {
    const s: Sketch = {
      plane: "XY",
      entities: [
        { id: "a", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
        { id: "b", type: "line", x1: 12, y1: 1, x2: 20, y2: 5 },
      ],
      constraints: [
        { id: "c", type: "coincident", a: { entity: "a", which: "end" }, b: { entity: "b", which: "start" } },
      ],
    };
    const r = solveSketch(s);
    const a = r.sketch.entities[0];
    const b = r.sketch.entities[1];
    if (a.type !== "line" || b.type !== "line") throw new Error("expected lines");
    expect(a.x2).toBeCloseTo(b.x1, 3);
    expect(a.y2).toBeCloseTo(b.y1, 3);
  });

  test("distance constraint sets endpoint separation", () => {
    const s: Sketch = {
      plane: "XY",
      entities: [{ id: "l", type: "line", x1: 0, y1: 0, x2: 5, y2: 0 }],
      constraints: [
        {
          id: "c",
          type: "distance",
          a: { entity: "l", which: "start" },
          b: { entity: "l", which: "end" },
          value: 20,
        },
      ],
    };
    const line = solveSketch(s).sketch.entities[0];
    if (line.type !== "line") throw new Error("expected line");
    expect(Math.hypot(line.x2 - line.x1, line.y2 - line.y1)).toBeCloseTo(20, 3);
  });

  test("radius constraint sizes a circle", () => {
    const s: Sketch = {
      plane: "XY",
      entities: [{ id: "c", type: "circle", cx: 0, cy: 0, r: 5 }],
      constraints: [{ id: "r", type: "radius", entity: "c", value: 12 }],
    };
    const circle = solveSketch(s).sketch.entities[0];
    if (circle.type !== "circle") throw new Error("expected circle");
    expect(circle.r).toBeCloseTo(12, 4);
  });

  test("dof falls as constraints are added", () => {
    const base: Sketch = {
      plane: "XY",
      entities: [{ id: "l", type: "line", x1: 0, y1: 0, x2: 10, y2: 0 }],
      constraints: [],
    };
    const withH: Sketch = { ...base, constraints: [{ id: "c", type: "horizontal", entity: "l" }] };
    expect(sketchDof(withH)).toBe(sketchDof(base) - 1);
  });
});
