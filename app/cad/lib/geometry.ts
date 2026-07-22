/**
 * Pure sketch geometry: plane frames, entity point handles, arc/circle
 * tessellation, and closed-profile ("region") detection.
 *
 * Everything here is deterministic and side-effect free so it can be unit
 * tested and run on the main thread before handing simple polygon lists to the
 * Manifold worker.
 */
import type { PlaneId, Sketch, SketchEntity } from "./types";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** A closed polygon (list of 2-D points, no repeated closing point). */
export type Polygon = Vec2[];

// ─── Plane frames ────────────────────────────────────────────────────────────

export interface PlaneBasis {
  origin: Vec3;
  /** In-plane right axis (sketch +u). */
  u: Vec3;
  /** In-plane up axis (sketch +v). */
  v: Vec3;
  /** Plane normal (u × v). */
  n: Vec3;
}

export function planeBasis(plane: PlaneId): PlaneBasis {
  switch (plane) {
    case "XY":
      return { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
    case "XZ":
      return { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] };
    case "YZ":
      return { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] };
  }
}

/** Map a sketch-local (u, v) point onto its plane in world space. */
export function planePointToWorld(plane: PlaneId, p: Vec2): Vec3 {
  const b = planeBasis(plane);
  return [
    b.u[0] * p[0] + b.v[0] * p[1],
    b.u[1] * p[0] + b.v[1] * p[1],
    b.u[2] * p[0] + b.v[2] * p[1],
  ];
}

/**
 * Column-major 4×4 that places a Z-extruded local solid onto `plane`
 * (columns U, V, N). Consumed by Manifold's `transform()`.
 */
export function extrudeMatrix(plane: PlaneId): number[] {
  const { u, v, n } = planeBasis(plane);
  return [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, 0, 0, 0, 1];
}

/**
 * Column-major 4×4 for a revolve. Manifold revolves the profile about its
 * local Y and outputs with the axis along Z, sweeping into X/Y; we map result
 * X→U, Y→N, Z→V so the axis follows the sketch's vertical (v) axis.
 */
export function revolveMatrix(plane: PlaneId): number[] {
  const { u, v, n } = planeBasis(plane);
  return [u[0], u[1], u[2], 0, n[0], n[1], n[2], 0, v[0], v[1], v[2], 0, 0, 0, 0, 1];
}

// ─── Entity point handles ────────────────────────────────────────────────────

/** The named characteristic points of an entity (for constraints / snapping). */
export function entityPoints(e: SketchEntity): Record<string, Vec2> {
  switch (e.type) {
    case "line":
      return { start: [e.x1, e.y1], end: [e.x2, e.y2] };
    case "circle":
      return { center: [e.cx, e.cy] };
    case "arc":
      return {
        center: [e.cx, e.cy],
        start: [e.cx + e.r * Math.cos(e.a0), e.cy + e.r * Math.sin(e.a0)],
        end: [e.cx + e.r * Math.cos(e.a1), e.cy + e.r * Math.sin(e.a1)],
      };
    case "rect":
      return {
        p0: [e.x, e.y],
        p1: [e.x + e.w, e.y],
        p2: [e.x + e.w, e.y + e.h],
        p3: [e.x, e.y + e.h],
        center: [e.x + e.w / 2, e.y + e.h / 2],
      };
    case "polyline": {
      const out: Record<string, Vec2> = {};
      e.points.forEach((p, i) => (out[`p${i}`] = [p[0], p[1]]));
      return out;
    }
  }
}

// ─── Tessellation ────────────────────────────────────────────────────────────

export function tessellateArc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  maxSeg = Math.PI / 16,
): Vec2[] {
  const span = a1 - a0;
  const segs = Math.max(2, Math.ceil(Math.abs(span) / maxSeg));
  const out: Vec2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (span * i) / segs;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function tessellateCircle(cx: number, cy: number, r: number, segs = 64): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Return the polygon wound counter-clockwise (positive signed area). */
export function ensureCCW(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

// ─── Region (closed-profile) detection ───────────────────────────────────────

interface Chainable {
  pts: Vec2[]; // ordered, length >= 2
}

const EPS = 1e-4;

function near(a: Vec2, b: Vec2): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

/**
 * Greedily chain open segments (lines, arcs, open polylines) end-to-end into
 * closed loops. Segments that can't be joined into a loop are dropped.
 */
export function chainLoops(segments: Chainable[]): Polygon[] {
  const used = new Array(segments.length).fill(false);
  const loops: Polygon[] = [];

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    let path = segments[s].pts.slice();
    let closed = false;

    // Extend the chain from its tail until it closes or dead-ends.
    for (let guard = 0; guard < segments.length + 1; guard++) {
      const head = path[0];
      const tail = path[path.length - 1];
      if (path.length >= 3 && near(head, tail)) {
        path = path.slice(0, -1); // drop duplicate closing point
        closed = true;
        break;
      }
      let extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const seg = segments[j].pts;
        const a = seg[0];
        const b = seg[seg.length - 1];
        if (near(tail, a)) {
          path = path.concat(seg.slice(1));
          used[j] = true;
          extended = true;
          break;
        }
        if (near(tail, b)) {
          path = path.concat(seg.slice(0, -1).reverse());
          used[j] = true;
          extended = true;
          break;
        }
      }
      if (!extended) break;
    }
    if (closed && path.length >= 3) loops.push(path);
  }
  return loops;
}

/**
 * Extract every closed profile (region) from a sketch as CCW polygons.
 * Explicitly-closed shapes (rect, circle, closed polyline) contribute directly;
 * loose lines/arcs are chained into loops.
 */
export function profilesFromSketch(sketch: Sketch): Polygon[] {
  const profiles: Polygon[] = [];
  const open: Chainable[] = [];

  for (const e of sketch.entities) {
    switch (e.type) {
      case "circle":
        profiles.push(tessellateCircle(e.cx, e.cy, e.r));
        break;
      case "rect":
        profiles.push([
          [e.x, e.y],
          [e.x + e.w, e.y],
          [e.x + e.w, e.y + e.h],
          [e.x, e.y + e.h],
        ]);
        break;
      case "polyline":
        if (e.closed && e.points.length >= 3) {
          profiles.push(e.points.map((p) => [p[0], p[1]] as Vec2));
        } else if (e.points.length >= 2) {
          open.push({ pts: e.points.map((p) => [p[0], p[1]] as Vec2) });
        }
        break;
      case "line":
        open.push({ pts: [[e.x1, e.y1], [e.x2, e.y2]] });
        break;
      case "arc":
        open.push({ pts: tessellateArc(e.cx, e.cy, e.r, e.a0, e.a1) });
        break;
    }
  }

  profiles.push(...chainLoops(open));
  return profiles
    .filter((p) => Math.abs(signedArea(p)) > EPS)
    .map(ensureCCW);
}

/** Axis-aligned bounds of a sketch (in plane-local coords), or null if empty. */
export function sketchBounds(
  sketch: Sketch,
): { min: Vec2; max: Vec2 } | null {
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  const eat = (p: Vec2) => {
    minx = Math.min(minx, p[0]);
    miny = Math.min(miny, p[1]);
    maxx = Math.max(maxx, p[0]);
    maxy = Math.max(maxy, p[1]);
  };
  for (const e of sketch.entities) {
    if (e.type === "circle" || e.type === "arc") {
      eat([e.cx - e.r, e.cy - e.r]);
      eat([e.cx + e.r, e.cy + e.r]);
    } else {
      Object.values(entityPoints(e)).forEach(eat);
    }
  }
  if (!Number.isFinite(minx)) return null;
  return { min: [minx, miny], max: [maxx, maxy] };
}
