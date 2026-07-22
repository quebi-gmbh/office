/**
 * Pure helpers for the 2-D sketch editor: coordinate transforms, snapping,
 * hit-testing, and geometry edits. Kept separate from the React component so
 * they can be reasoned about (and unit tested) on their own.
 */
import { entityPoints, tessellateArc, type Vec2 } from "../lib/geometry";
import type { PointRef, SketchEntity } from "../lib/types";

export interface View {
  /** Pixels per millimetre. */
  scale: number;
  /** Screen x of sketch origin. */
  ox: number;
  /** Screen y of sketch origin. */
  oy: number;
}

export function worldToScreen(v: View, p: Vec2): Vec2 {
  return [v.ox + p[0] * v.scale, v.oy - p[1] * v.scale];
}

export function screenToWorld(v: View, sx: number, sy: number): Vec2 {
  return [(sx - v.ox) / v.scale, (v.oy - sy) / v.scale];
}

export function snapToGrid(p: Vec2, grid: number): Vec2 {
  return [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid];
}

export interface SnapCandidate {
  point: Vec2;
  kind: "endpoint" | "center" | "midpoint" | "grid";
  ref?: PointRef;
}

/** Collect snap candidates (entity endpoints, centres, midpoints). */
export function snapCandidates(entities: SketchEntity[]): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  for (const e of entities) {
    const pts = entityPoints(e);
    for (const [which, p] of Object.entries(pts)) {
      out.push({ point: p, kind: which === "center" ? "center" : "endpoint", ref: { entity: e.id, which } });
    }
    if (e.type === "line") {
      out.push({ point: [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2], kind: "midpoint" });
    }
  }
  return out;
}

/**
 * Snap a world point to the nearest entity feature, falling back to the grid.
 * `tolWorld` is the pick radius in world units (derived from a pixel radius).
 */
export function snap(
  world: Vec2,
  entities: SketchEntity[],
  grid: number,
  snapGrid: boolean,
  tolWorld: number,
): SnapCandidate {
  let best: SnapCandidate | null = null;
  let bestD = tolWorld;
  for (const c of snapCandidates(entities)) {
    const d = Math.hypot(c.point[0] - world[0], c.point[1] - world[1]);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best) return best;
  if (snapGrid) return { point: snapToGrid(world, grid), kind: "grid" };
  return { point: world, kind: "grid" };
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distance from a world point to an entity's outline (world units). */
export function distanceToEntity(p: Vec2, e: SketchEntity): number {
  switch (e.type) {
    case "line":
      return distToSegment(p, [e.x1, e.y1], [e.x2, e.y2]);
    case "circle":
      return Math.abs(Math.hypot(p[0] - e.cx, p[1] - e.cy) - e.r);
    case "arc": {
      const pts = tessellateArc(e.cx, e.cy, e.r, e.a0, e.a1);
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(p, pts[i], pts[i + 1]));
      return d;
    }
    case "rect": {
      const c: Vec2[] = [
        [e.x, e.y],
        [e.x + e.w, e.y],
        [e.x + e.w, e.y + e.h],
        [e.x, e.y + e.h],
      ];
      let d = Infinity;
      for (let i = 0; i < 4; i++) d = Math.min(d, distToSegment(p, c[i], c[(i + 1) % 4]));
      return d;
    }
    case "polyline": {
      let d = Infinity;
      const n = e.points.length;
      const last = e.closed ? n : n - 1;
      for (let i = 0; i < last; i++) d = Math.min(d, distToSegment(p, e.points[i], e.points[(i + 1) % n]));
      return d;
    }
  }
}

export function hitEntity(p: Vec2, entities: SketchEntity[], tolWorld: number): string | null {
  let best: string | null = null;
  let bestD = tolWorld;
  for (const e of entities) {
    const d = distanceToEntity(p, e);
    if (d < bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}

export function hitPoint(p: Vec2, entities: SketchEntity[], tolWorld: number): PointRef | null {
  let best: PointRef | null = null;
  let bestD = tolWorld;
  for (const e of entities) {
    for (const [which, pt] of Object.entries(entityPoints(e))) {
      const d = Math.hypot(pt[0] - p[0], pt[1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = { entity: e.id, which };
      }
    }
  }
  return best;
}

/** Return a copy of `e` with the named point moved to (x, y). */
export function moveEntityPoint(e: SketchEntity, which: string, x: number, y: number): SketchEntity {
  switch (e.type) {
    case "line":
      if (which === "start") return { ...e, x1: x, y1: y };
      if (which === "end") return { ...e, x2: x, y2: y };
      return e;
    case "circle":
    case "arc":
      if (which === "center") return { ...e, cx: x, cy: y };
      return e;
    case "polyline": {
      const m = /^p(\d+)$/.exec(which);
      if (!m) return e;
      const i = Number(m[1]);
      const points = e.points.map((pt, idx) => (idx === i ? ([x, y] as Vec2) : pt));
      return { ...e, points };
    }
    default:
      return e;
  }
}

/** Return a copy of `e` translated by (dx, dy). */
export function translateEntity(e: SketchEntity, dx: number, dy: number): SketchEntity {
  switch (e.type) {
    case "line":
      return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy };
    case "circle":
    case "arc":
      return { ...e, cx: e.cx + dx, cy: e.cy + dy };
    case "rect":
      return { ...e, x: e.x + dx, y: e.y + dy };
    case "polyline":
      return { ...e, points: e.points.map((p) => [p[0] + dx, p[1] + dy] as Vec2) };
  }
}
