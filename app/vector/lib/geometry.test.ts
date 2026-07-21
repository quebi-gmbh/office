import { describe, expect, test } from "bun:test";
import {
  hitTest,
  localBBox,
  moveNode,
  nodeCenter,
  nodeInMarquee,
  scaleNode,
  snap,
  toLocal,
  worldBounds,
} from "./geometry";
import type { EllipseNode, RectNode, VNode } from "./types";

function rect(over: Partial<RectNode> = {}): RectNode {
  return {
    id: "r",
    type: "rect",
    x: 10,
    y: 20,
    w: 100,
    h: 50,
    rx: 0,
    rotation: 0,
    fill: "#000",
    stroke: null,
    strokeWidth: 1,
    opacity: 1,
    ...over,
  };
}

describe("localBBox", () => {
  test("rect", () => {
    expect(localBBox(rect())).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
  test("line normalises min corner", () => {
    const line: VNode = {
      id: "l",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 20,
      y2: 40,
      rotation: 0,
      fill: null,
      stroke: "#000",
      strokeWidth: 1,
      opacity: 1,
    };
    expect(localBBox(line)).toEqual({ x: 20, y: 40, w: 80, h: 60 });
  });
});

describe("nodeCenter", () => {
  test("centre of a rect", () => {
    expect(nodeCenter(rect())).toEqual([60, 45]);
  });
});

describe("move", () => {
  test("translates geometry", () => {
    const moved = moveNode(rect(), 5, -5);
    expect(moved.x).toBe(15);
    expect(moved.y).toBe(15);
  });
});

describe("scaleNode", () => {
  test("doubles a rect from its top-left", () => {
    const scaled = scaleNode(rect(), 10, 20, 2, 2);
    expect(scaled.x).toBe(10);
    expect(scaled.y).toBe(20);
    expect(scaled.w).toBe(200);
    expect(scaled.h).toBe(100);
  });
  test("negative scale normalises rect origin", () => {
    const scaled = scaleNode(rect({ x: 0, y: 0, w: 100, h: 100 }), 100, 100, -0.5, -0.5);
    expect(scaled.w).toBeGreaterThan(0);
    expect(scaled.h).toBeGreaterThan(0);
  });
});

describe("rotation mapping", () => {
  test("toLocal inverts rotation about centre", () => {
    const r = rect({ rotation: 90 });
    const [cx, cy] = nodeCenter(r);
    // Un-rotating a 90°-rotated node by -90° maps the point 30px above the
    // centre onto the point 30px to its left, on the same y as the centre.
    const local = toLocal(r, [cx, cy - 30]);
    expect(Math.abs(local[0] - (cx - 30))).toBeLessThan(1e-6);
    expect(Math.abs(local[1] - cy)).toBeLessThan(1e-6);
  });
  test("worldBounds grows for a rotated rect", () => {
    const straight = worldBounds(rect());
    const rotated = worldBounds(rect({ rotation: 45 }));
    expect(rotated.maxX - rotated.minX).toBeGreaterThan(straight.maxX - straight.minX);
  });
});

describe("hitTest", () => {
  test("hits inside a filled rect", () => {
    expect(hitTest(rect(), [50, 40], 2)).toBe(true);
  });
  test("misses outside", () => {
    expect(hitTest(rect(), [500, 500], 2)).toBe(false);
  });
  test("ellipse corner is outside the ellipse", () => {
    const e: EllipseNode = { ...rect(), type: "ellipse", x: 0, y: 0, w: 100, h: 100 } as EllipseNode;
    expect(hitTest(e, [50, 50], 2)).toBe(true);
    expect(hitTest(e, [2, 2], 1)).toBe(false);
  });
});

describe("marquee", () => {
  test("fully-enclosed node selected", () => {
    expect(nodeInMarquee(rect(), { x: 0, y: 0, w: 200, h: 200 })).toBe(true);
  });
  test("partially-outside node not selected", () => {
    expect(nodeInMarquee(rect(), { x: 0, y: 0, w: 50, h: 200 })).toBe(false);
  });
});

describe("snap", () => {
  test("rounds to nearest grid line", () => {
    expect(snap(23, 10)).toBe(20);
    expect(snap(26, 10)).toBe(30);
    expect(snap(7, 0)).toBe(7);
  });
});
