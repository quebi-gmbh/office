/**
 * Polygon boolean operations (union / subtract / intersect / exclude) via the
 * Greiner–Hormann algorithm.
 *
 * Nodes are first flattened to closed world-space polygons ({@link nodeToPolygon}),
 * clipped pairwise, and the resulting contour(s) rebuilt as closed poly-line
 * nodes. This is intentionally scoped to closed, filled shapes (rect, ellipse,
 * polygon/star, closed poly-line); open paths, text and images are ignored.
 *
 * The classic algorithm assumes non-degenerate input (no vertex lying exactly
 * on the other polygon's edge). We nudge the clip polygon by a sub-pixel
 * epsilon to avoid the common axis-aligned degeneracies; callers should treat
 * an empty result as "operation not applicable" and leave the inputs untouched.
 */
import { toWorld, localBBox } from "./geometry";
import { newId } from "./id";
import type { BooleanOp, Point, PolylineNode, VNode } from "./types";

/** World-space closed polygon for a boolean-capable node, else null. */
export function nodeToPolygon(node: VNode): Point[] | null {
  switch (node.type) {
    case "rect": {
      const b = localBBox(node);
      return [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.h],
        [b.x, b.y + b.h],
      ].map((p) => toWorld(node, p as Point));
    }
    case "ellipse": {
      const b = localBBox(node);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const rx = b.w / 2;
      const ry = b.h / 2;
      const n = 64;
      const pts: Point[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(toWorld(node, [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]));
      }
      return pts;
    }
    case "polyline":
      if (node.closed && node.points.length >= 3) {
        return node.points.map((p) => toWorld(node, p));
      }
      return null;
    default:
      return null;
  }
}

export function canBoolean(node: VNode): boolean {
  return nodeToPolygon(node) !== null;
}

// ─── Greiner–Hormann ──────────────────────────────────────────────────────────

interface Vtx {
  x: number;
  y: number;
  next: Vtx;
  prev: Vtx;
  intersect: boolean;
  entry: boolean;
  neighbour: Vtx | null;
  alpha: number;
  visited: boolean;
}

function makeVtx(x: number, y: number): Vtx {
  const v: Vtx = {
    x,
    y,
    next: null as unknown as Vtx,
    prev: null as unknown as Vtx,
    intersect: false,
    entry: false,
    neighbour: null,
    alpha: 0,
    visited: false,
  };
  return v;
}

function buildList(poly: Point[]): Vtx {
  const verts = poly.map(([x, y]) => makeVtx(x, y));
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    verts[i].next = verts[(i + 1) % n];
    verts[i].prev = verts[(i - 1 + n) % n];
  }
  return verts[0];
}

function forEachVertex(first: Vtx, fn: (v: Vtx) => void) {
  let v = first;
  do {
    fn(v);
    v = v.next;
  } while (v !== first);
}

function pointInPolygon(x: number, y: number, first: Vtx): boolean {
  let inside = false;
  let v = first;
  do {
    const a = v;
    const b = v.next;
    if ((a.y > y) !== (b.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      if (x < a.x + t * (b.x - a.x)) inside = !inside;
    }
    v = v.next;
  } while (v !== first);
  return inside;
}

/** Insert `ins` into the ring between `after` and its (edge) end, sorted by alpha. */
function insertBetween(ins: Vtx, start: Vtx, end: Vtx) {
  let curr = start;
  while (curr !== end && curr.alpha < ins.alpha) curr = curr.next;
  ins.next = curr;
  ins.prev = curr.prev;
  ins.prev.next = ins;
  curr.prev = ins;
}

interface Isect {
  x: number;
  y: number;
  toS: number;
  toC: number;
}

function segIntersect(a: Vtx, b: Vtx, c: Vtx, d: Vtx): Isect | null {
  const denom = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);
  if (denom === 0) return null;
  const toS = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denom;
  const toC = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denom;
  if (toS <= 0 || toS >= 1 || toC <= 0 || toC >= 1) return null;
  return { x: a.x + toS * (b.x - a.x), y: a.y + toS * (b.y - a.y), toS, toC };
}

/**
 * Clip `subjectPoly` against `clipPoly`. Returns 0+ closed contours.
 * `op` selects union / intersect / difference (subtract) / exclusive-or.
 */
export function greinerHormann(subjectPoly: Point[], clipPoly: Point[], op: BooleanOp): Point[][] {
  if (subjectPoly.length < 3 || clipPoly.length < 3) return [];
  // XOR = (A − B) ∪ (B − A): compute both difference passes and merge.
  if (op === "exclude") {
    return [
      ...greinerHormann(subjectPoly, clipPoly, "subtract"),
      ...greinerHormann(clipPoly, subjectPoly, "subtract"),
    ];
  }
  // Nudge the clip polygon a hair to dodge axis-aligned degeneracies.
  const eps = 1e-6;
  const clipN = clipPoly.map(([x, y], i) => [x + eps * (i + 1), y + eps * (i + 2)] as Point);

  const subject = buildList(subjectPoly);
  const clip = buildList(clipN);

  // Phase 1 — find & link intersections.
  let found = false;
  const subjEdges: Vtx[] = [];
  forEachVertex(subject, (v) => subjEdges.push(v));
  const clipEdges: Vtx[] = [];
  forEachVertex(clip, (v) => clipEdges.push(v));

  for (const s of subjEdges) {
    if (s.intersect) continue;
    const sNext = nextNonIntersect(s);
    for (const c of clipEdges) {
      if (c.intersect) continue;
      const cNext = nextNonIntersect(c);
      const hit = segIntersect(s, sNext, c, cNext);
      if (!hit) continue;
      const sv = makeVtx(hit.x, hit.y);
      const cv = makeVtx(hit.x, hit.y);
      sv.intersect = cv.intersect = true;
      sv.alpha = hit.toS;
      cv.alpha = hit.toC;
      sv.neighbour = cv;
      cv.neighbour = sv;
      insertBetween(sv, s.next, sNext);
      insertBetween(cv, c.next, cNext);
      found = true;
    }
  }
  if (!found) return [];

  // Phase 2 — entry/exit flags.
  markEntry(subject, clip, op, true);
  markEntry(clip, subject, op, false);

  // Phase 3 — trace result contours.
  const result: Point[][] = [];
  const startCandidates: Vtx[] = [];
  forEachVertex(subject, (v) => {
    if (v.intersect) startCandidates.push(v);
  });

  for (const start of startCandidates) {
    if (start.visited) continue;
    const contour: Point[] = [];
    let current: Vtx = start;
    do {
      current.visited = true;
      if (current.neighbour) current.neighbour.visited = true;
      if (current.entry) {
        do {
          current = current.next;
          contour.push([current.x, current.y]);
        } while (!current.intersect);
      } else {
        do {
          current = current.prev;
          contour.push([current.x, current.y]);
        } while (!current.intersect);
      }
      current = current.neighbour ?? current;
    } while (current !== start && !current.visited);
    if (contour.length >= 3) result.push(contour);
  }
  return result;
}

function nextNonIntersect(v: Vtx): Vtx {
  let n = v.next;
  while (n.intersect) n = n.next;
  return n;
}

function markEntry(poly: Vtx, other: Vtx, op: BooleanOp, isSubject: boolean) {
  let status = !pointInPolygon(poly.x, poly.y, other);
  // Flip the initial state per operation so a single tracer yields the op.
  //  intersect: keep subject∩clip           → no flips
  //  union:     keep subject∪clip            → flip both rings
  //  subtract:  keep subject∖clip            → flip the subject ring only
  if (op === "union") status = !status;
  if (op === "subtract" && isSubject) status = !status;
  forEachVertex(poly, (v) => {
    if (v.intersect) {
      v.entry = status;
      status = !status;
    }
  });
}

/**
 * Apply a boolean op to a list of boolean-capable nodes (folded left-to-right)
 * and return the resulting closed poly-line node(s). Returns null when the op
 * can't be applied (fewer than two polygons, or an empty geometric result).
 * Style is inherited from the first (bottom-most) input node.
 */
export function booleanNodes(nodes: VNode[], op: BooleanOp): VNode[] | null {
  const polys = nodes.map(nodeToPolygon).filter((p): p is Point[] => p !== null);
  if (polys.length < 2) return null;
  const style = nodes.find((n) => nodeToPolygon(n))!;

  let acc: Point[][] = [polys[0]];
  for (let i = 1; i < polys.length; i++) {
    const next: Point[][] = [];
    for (const contour of acc) {
      const clipped = greinerHormann(contour, polys[i], op);
      if (clipped.length === 0) {
        // Union with a non-overlapping shape keeps both pieces.
        if (op === "union") next.push(contour, polys[i]);
      } else {
        next.push(...clipped);
      }
    }
    acc = next;
    if (acc.length === 0) return null;
  }
  if (acc.length === 0) return null;

  return acc.map((contour) => {
    const node: PolylineNode = {
      id: newId(),
      type: "polyline",
      points: contour.map(([x, y]) => [round(x), round(y)] as Point),
      closed: true,
      rotation: 0,
      fill: style.fill,
      fillGradient: style.fillGradient ?? null,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      opacity: style.opacity,
    };
    return node;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;
