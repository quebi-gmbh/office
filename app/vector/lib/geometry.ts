/**
 * Geometry helpers: axis-aligned bounding boxes over a node's *local*
 * (un-rotated) geometry, rotation-aware point mapping, hit-testing, and the
 * move / scale operations used by the transform tools.
 *
 * All coordinates are in document space. A node's rotation is applied about the
 * centre of its local bbox; to work in a rotated node's frame we map world
 * points into local space with {@link toLocal}.
 */
import type { Point, VNode } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Local (un-rotated) axis-aligned bbox of a single node. */
export function localBBox(node: VNode): Rect {
  switch (node.type) {
    case "rect":
    case "ellipse":
      return { x: node.x, y: node.y, w: node.w, h: node.h };
    case "line": {
      const minX = Math.min(node.x1, node.x2);
      const minY = Math.min(node.y1, node.y2);
      return {
        x: minX,
        y: minY,
        w: Math.abs(node.x2 - node.x1),
        h: Math.abs(node.y2 - node.y1),
      };
    }
    case "polyline":
    case "path": {
      if (node.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [px, py] of node.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case "text": {
      // Approximate: width ≈ 0.6em per char, height ≈ 1.2em. `y` is the
      // text baseline; the visual box starts ~0.8em above it.
      const w = Math.max(node.text.length, 1) * node.fontSize * 0.6;
      const h = node.fontSize * 1.2;
      return { x: node.x, y: node.y - node.fontSize * 0.8, w, h };
    }
  }
}

/** Centre of a node's local bbox (also its rotation pivot). */
export function nodeCenter(node: VNode): Point {
  const b = localBBox(node);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

function rotatePoint(px: number, py: number, cx: number, cy: number, deg: number): Point {
  if (!deg) return [px, py];
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** Map a world point into a node's local (un-rotated) frame. */
export function toLocal(node: VNode, p: Point): Point {
  const [cx, cy] = nodeCenter(node);
  return rotatePoint(p[0], p[1], cx, cy, -node.rotation);
}

/** Map a local-frame point back into world space. */
export function toWorld(node: VNode, p: Point): Point {
  const [cx, cy] = nodeCenter(node);
  return rotatePoint(p[0], p[1], cx, cy, node.rotation);
}

/** The four world-space corners of a node's (possibly rotated) bbox. */
export function worldCorners(node: VNode): Point[] {
  const b = localBBox(node);
  const corners: Point[] = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ];
  return corners.map((c) => toWorld(node, c));
}

/** Axis-aligned world bbox that encloses the (possibly rotated) node. */
export function worldBounds(node: VNode): Bounds {
  const pts = worldCorners(node);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Union world bbox of many nodes (null if empty). */
export function unionBounds(nodes: VNode[]): Bounds | null {
  if (nodes.length === 0) return null;
  let b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    const nb = worldBounds(n);
    b = {
      minX: Math.min(b.minX, nb.minX),
      minY: Math.min(b.minY, nb.minY),
      maxX: Math.max(b.maxX, nb.maxX),
      maxY: Math.max(b.maxY, nb.maxY),
    };
  }
  return b;
}

export function boundsToRect(b: Bounds): Rect {
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
}

// ─── Hit testing ────────────────────────────────────────────────────────────

function pointInRect(p: Point, b: Rect, pad = 0): boolean {
  return (
    p[0] >= b.x - pad &&
    p[0] <= b.x + b.w + pad &&
    p[1] >= b.y - pad &&
    p[1] <= b.y + b.h + pad
  );
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = a[0] + t * vx - p[0];
  const dy = a[1] + t * vy - p[1];
  return Math.hypot(dx, dy);
}

/**
 * Does a world point hit this node? `tol` is a pointer tolerance in document
 * units (scaled for zoom by the caller).
 */
export function hitTest(node: VNode, worldPoint: Point, tol: number): boolean {
  const p = toLocal(node, worldPoint);
  const pad = Math.max(tol, node.strokeWidth / 2);
  switch (node.type) {
    case "rect":
    case "text":
    case "ellipse": {
      const b = localBBox(node);
      if (node.type === "ellipse") {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const rx = b.w / 2 + pad;
        const ry = b.h / 2 + pad;
        if (rx <= 0 || ry <= 0) return pointInRect(p, b, pad);
        const nx = (p[0] - cx) / rx;
        const ny = (p[1] - cy) / ry;
        return nx * nx + ny * ny <= 1;
      }
      return pointInRect(p, b, pad);
    }
    case "line":
      return distToSegment(p, [node.x1, node.y1], [node.x2, node.y2]) <= pad;
    case "polyline": {
      const pts = node.points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(p, pts[i], pts[i + 1]) <= pad) return true;
      }
      if (node.closed && pts.length > 2) {
        if (distToSegment(p, pts[pts.length - 1], pts[0]) <= pad) return true;
      }
      return false;
    }
    case "path": {
      const pts = node.points;
      const t = Math.max(pad, node.strokeWidth);
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(p, pts[i], pts[i + 1]) <= t) return true;
      }
      return pts.length === 1 ? Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= t : false;
    }
  }
}

/** Is a node's world bbox fully inside the marquee rect? */
export function nodeInMarquee(node: VNode, marquee: Rect): boolean {
  const b = worldBounds(node);
  return (
    b.minX >= marquee.x &&
    b.minY >= marquee.y &&
    b.maxX <= marquee.x + marquee.w &&
    b.maxY <= marquee.y + marquee.h
  );
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Translate every geometry coordinate by (dx, dy). Returns a new node. */
export function moveNode<T extends VNode>(node: T, dx: number, dy: number): T {
  switch (node.type) {
    case "rect":
    case "ellipse":
    case "text":
      return { ...node, x: node.x + dx, y: node.y + dy };
    case "line":
      return { ...node, x1: node.x1 + dx, y1: node.y1 + dy, x2: node.x2 + dx, y2: node.y2 + dy };
    case "polyline":
    case "path":
      return { ...node, points: node.points.map(([x, y]) => [x + dx, y + dy] as Point) };
  }
}

/**
 * Scale a node's local geometry about a fixed local origin. Used by the resize
 * handles (which operate in the node's rotated frame, so origin/scale are given
 * in local coordinates).
 */
export function scaleNode<T extends VNode>(
  node: T,
  originX: number,
  originY: number,
  sx: number,
  sy: number,
): T {
  const sc = (x: number, y: number): Point => [
    originX + (x - originX) * sx,
    originY + (y - originY) * sy,
  ];
  switch (node.type) {
    case "rect":
    case "ellipse": {
      const [nx, ny] = sc(node.x, node.y);
      const w = node.w * sx;
      const h = node.h * sy;
      // Normalise negative sizes so x/y stays top-left.
      const out = { ...node, x: w < 0 ? nx + w : nx, y: h < 0 ? ny + h : ny, w: Math.abs(w), h: Math.abs(h) };
      if (out.type === "rect") {
        out.rx = Math.min(out.rx, out.w / 2, out.h / 2);
      }
      return out;
    }
    case "text": {
      const [nx, ny] = sc(node.x, node.y);
      return { ...node, x: nx, y: ny, fontSize: Math.max(1, node.fontSize * Math.abs(sy)) };
    }
    case "line": {
      const [x1, y1] = sc(node.x1, node.y1);
      const [x2, y2] = sc(node.x2, node.y2);
      return { ...node, x1, y1, x2, y2 };
    }
    case "polyline":
    case "path":
      return { ...node, points: node.points.map(([x, y]) => sc(x, y)) };
  }
}

/** Snap a world coordinate to the nearest grid line. */
export function snap(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function snapPoint(p: Point, grid: number): Point {
  return [snap(p[0], grid), snap(p[1], grid)];
}
