/**
 * Parametric primitive generators — polygon (N sides), star, arc and spiral.
 *
 * Each generator returns a plain `Point[]` in document space so they are easy
 * to unit-test and reuse; {@link makeParametricShape} wraps them into a
 * {@link PolylineNode} (closed for polygon/star, open for arc/spiral) using the
 * drag rectangle (start → end corners) as the bounding box.
 */
import type { Point, PolylineNode, Style, ToolId, VNode } from "./types";

export interface ShapeParams {
  polygonSides: number;
  starPoints: number;
  /** Inner-radius ratio of the star (0..1). */
  starInner: number;
  spiralTurns: number;
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = {
  polygonSides: 6,
  starPoints: 5,
  starInner: 0.5,
  spiralTurns: 3,
};

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

function ellipseFromCorners(a: Point, b: Point): Ellipse {
  return {
    cx: (a[0] + b[0]) / 2,
    cy: (a[1] + b[1]) / 2,
    rx: Math.abs(b[0] - a[0]) / 2,
    ry: Math.abs(b[1] - a[1]) / 2,
  };
}

const TAU = Math.PI * 2;

/** Regular N-gon inscribed in the ellipse, first vertex pointing up. */
export function polygonPoints(e: Ellipse, sides: number): Point[] {
  const n = Math.max(3, Math.round(sides));
  const pts: Point[] = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * TAU;
    pts.push([e.cx + Math.cos(a) * e.rx, e.cy + Math.sin(a) * e.ry]);
  }
  return pts;
}

/** M-point star with the given inner-radius ratio, first spike pointing up. */
export function starPoints(e: Ellipse, points: number, innerRatio: number): Point[] {
  const n = Math.max(2, Math.round(points));
  const ratio = Math.max(0.05, Math.min(0.95, innerRatio));
  const pts: Point[] = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < n * 2; i++) {
    const a = start + (i / (n * 2)) * TAU;
    const r = i % 2 === 0 ? 1 : ratio;
    pts.push([e.cx + Math.cos(a) * e.rx * r, e.cy + Math.sin(a) * e.ry * r]);
  }
  return pts;
}

/** Open elliptical arc sampled as a poly-line, from `from`° to `to`°. */
export function arcPoints(e: Ellipse, fromDeg = 0, toDeg = 270, segments = 48): Point[] {
  const from = (fromDeg * Math.PI) / 180;
  const to = (toDeg * Math.PI) / 180;
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments;
    pts.push([e.cx + Math.cos(a) * e.rx, e.cy + Math.sin(a) * e.ry]);
  }
  return pts;
}

/** Archimedean spiral filling the ellipse, `turns` full revolutions. */
export function spiralPoints(e: Ellipse, turns: number, perTurn = 32): Point[] {
  const t = Math.max(0.5, turns);
  const total = Math.max(8, Math.round(t * perTurn));
  const pts: Point[] = [];
  for (let i = 0; i <= total; i++) {
    const frac = i / total;
    const a = frac * t * TAU;
    pts.push([e.cx + Math.cos(a) * e.rx * frac, e.cy + Math.sin(a) * e.ry * frac]);
  }
  return pts;
}

export function isParametricTool(tool: ToolId): boolean {
  return tool === "polygon" || tool === "star" || tool === "arc" || tool === "spiral";
}

/**
 * Build a poly-line node for a parametric tool from a drag rectangle. `id`
 * defaults to "draft" for live previews.
 */
export function makeParametricShape(
  tool: ToolId,
  start: Point,
  end: Point,
  style: Style,
  params: ShapeParams,
  id = "draft",
): VNode {
  const e = ellipseFromCorners(start, end);
  const base: Omit<PolylineNode, "points" | "closed"> = { ...style, id, type: "polyline", rotation: 0 };
  switch (tool) {
    case "polygon":
      return { ...base, points: polygonPoints(e, params.polygonSides), closed: true };
    case "star":
      return { ...base, points: starPoints(e, params.starPoints, params.starInner), closed: true };
    case "arc":
      return { ...base, points: arcPoints(e), closed: false, fill: null };
    case "spiral":
      return { ...base, points: spiralPoints(e, params.spiralTurns), closed: false, fill: null };
    default:
      return { ...base, points: polygonPoints(e, params.polygonSides), closed: true };
  }
}
