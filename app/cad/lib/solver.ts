/**
 * A small numeric constraint solver for 2-D sketches.
 *
 * Sketch entities expose their degrees of freedom as a flat variable vector;
 * each constraint contributes one or more residual functions that should be
 * driven to zero. A damped Gauss–Newton (Levenberg–Marquardt) iteration solves
 * the least-squares system, which stays interactive for the small systems a
 * sketch produces and degrades gracefully on over-/under-constrained input.
 */
import type { Constraint, PointRef, Sketch, SketchEntity } from "./types";

// ─── Tiny dense linear algebra ───────────────────────────────────────────────

/** Solve `A x = b` for a small symmetric system via Gaussian elimination. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot.
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

// ─── Variable layout ─────────────────────────────────────────────────────────

type ResidualFn = (x: number[]) => number;

interface Layout {
  x: number[];
  /** Base variable index for each entity id (params packed in a fixed order). */
  base: Map<string, { entity: SketchEntity; base: number }>;
  /** Solvable point → its [xIndex, yIndex] variable indices. */
  point: Map<string, [number, number]>;
}

function pointKey(ref: PointRef): string {
  return `${ref.entity}:${ref.which}`;
}

function buildLayout(sketch: Sketch): Layout {
  const x: number[] = [];
  const base = new Map<string, { entity: SketchEntity; base: number }>();
  const point = new Map<string, [number, number]>();

  for (const e of sketch.entities) {
    const b = x.length;
    base.set(e.id, { entity: e, base: b });
    switch (e.type) {
      case "line":
        x.push(e.x1, e.y1, e.x2, e.y2);
        point.set(`${e.id}:start`, [b, b + 1]);
        point.set(`${e.id}:end`, [b + 2, b + 3]);
        break;
      case "circle":
        x.push(e.cx, e.cy, e.r);
        point.set(`${e.id}:center`, [b, b + 1]);
        break;
      case "arc":
        x.push(e.cx, e.cy, e.r, e.a0, e.a1);
        point.set(`${e.id}:center`, [b, b + 1]);
        break;
      case "rect":
        x.push(e.x, e.y, e.w, e.h);
        break;
      case "polyline":
        e.points.forEach((p, i) => {
          point.set(`${e.id}:p${i}`, [b + 2 * i, b + 2 * i + 1]);
          x.push(p[0], p[1]);
        });
        break;
    }
  }
  return { x, base, point };
}

function applyLayout(sketch: Sketch, layout: Layout, x: number[]): Sketch {
  const entities = sketch.entities.map((e): SketchEntity => {
    const b = layout.base.get(e.id)!.base;
    switch (e.type) {
      case "line":
        return { ...e, x1: x[b], y1: x[b + 1], x2: x[b + 2], y2: x[b + 3] };
      case "circle":
        return { ...e, cx: x[b], cy: x[b + 1], r: x[b + 2] };
      case "arc":
        return { ...e, cx: x[b], cy: x[b + 1], r: x[b + 2], a0: x[b + 3], a1: x[b + 4] };
      case "rect":
        return { ...e, x: x[b], y: x[b + 1], w: x[b + 2], h: x[b + 3] };
      case "polyline":
        return {
          ...e,
          points: e.points.map((_, i) => [x[b + 2 * i], x[b + 2 * i + 1]]),
        };
    }
  });
  return { ...sketch, entities };
}

// ─── Residuals ───────────────────────────────────────────────────────────────

function buildResiduals(sketch: Sketch, layout: Layout): ResidualFn[] {
  const res: ResidualFn[] = [];
  const pt = (ref: PointRef) => layout.point.get(pointKey(ref)) ?? null;

  for (const c of sketch.constraints) {
    switch (c.type) {
      case "horizontal": {
        const b = layout.base.get(c.entity);
        if (b && b.entity.type === "line") {
          const base = b.base;
          res.push((x) => x[base + 3] - x[base + 1]); // y2 - y1
        }
        break;
      }
      case "vertical": {
        const b = layout.base.get(c.entity);
        if (b && b.entity.type === "line") {
          const base = b.base;
          res.push((x) => x[base + 2] - x[base]); // x2 - x1
        }
        break;
      }
      case "coincident": {
        const a = pt(c.a);
        const bb = pt(c.b);
        if (a && bb) {
          res.push((x) => x[a[0]] - x[bb[0]]);
          res.push((x) => x[a[1]] - x[bb[1]]);
        }
        break;
      }
      case "distance": {
        const a = pt(c.a);
        const bb = pt(c.b);
        if (a && bb) {
          res.push((x) => {
            const dx = x[a[0]] - x[bb[0]];
            const dy = x[a[1]] - x[bb[1]];
            return Math.hypot(dx, dy) - c.value;
          });
        }
        break;
      }
      case "radius": {
        const b = layout.base.get(c.entity);
        if (b && (b.entity.type === "circle" || b.entity.type === "arc")) {
          const ri = b.base + 2;
          res.push((x) => x[ri] - c.value);
        }
        break;
      }
    }
  }
  return res;
}

// ─── Solve ───────────────────────────────────────────────────────────────────

export interface SolveResult {
  sketch: Sketch;
  /** Root-mean-square residual after solving. */
  residual: number;
  iterations: number;
  converged: boolean;
  /** #variables − #independent residuals; > 0 ⇒ under-constrained. */
  dof: number;
}

export interface SolveOptions {
  maxIter?: number;
  tol?: number;
  /** Variable indices to hold fixed (e.g. a point being dragged). */
  fixed?: number[];
}

function evalResiduals(fns: ResidualFn[], x: number[]): number[] {
  return fns.map((f) => f(x));
}

function cost(r: number[]): number {
  let s = 0;
  for (const v of r) s += v * v;
  return s;
}

/**
 * Solve the sketch's constraints, returning an updated sketch. Pure — the input
 * sketch is not mutated.
 */
export function solveSketch(sketch: Sketch, opts: SolveOptions = {}): SolveResult {
  const layout = buildLayout(sketch);
  const fns = buildResiduals(sketch, layout);
  const n = layout.x.length;
  const m = fns.length;
  const maxIter = opts.maxIter ?? 80;
  const tol = opts.tol ?? 1e-10;
  const fixed = new Set(opts.fixed ?? []);

  if (m === 0 || n === 0) {
    return { sketch, residual: 0, iterations: 0, converged: true, dof: n };
  }

  let x = layout.x.slice();
  let lambda = 1e-3;
  let iters = 0;
  const H = 1e-7;

  for (; iters < maxIter; iters++) {
    const r = evalResiduals(fns, x);
    const c0 = cost(r);
    if (c0 < tol) break;

    // Numeric Jacobian (forward difference), skipping fixed columns.
    const J: number[][] = r.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      if (fixed.has(j)) continue;
      const xj = x[j];
      x[j] = xj + H;
      const rp = evalResiduals(fns, x);
      x[j] = xj;
      for (let i = 0; i < m; i++) J[i][j] = (rp[i] - r[i]) / H;
    }

    // Normal equations: (JᵀJ + λ·diag) dx = −Jᵀr
    const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const Jtr: number[] = new Array(n).fill(0);
    for (let i = 0; i < m; i++) {
      for (let a = 0; a < n; a++) {
        const jia = J[i][a];
        if (jia === 0) continue;
        Jtr[a] += jia * r[i];
        for (let b = a; b < n; b++) {
          JtJ[a][b] += jia * J[i][b];
        }
      }
    }
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) JtJ[b][a] = JtJ[a][b];
    }
    for (let a = 0; a < n; a++) {
      JtJ[a][a] += lambda * (JtJ[a][a] + 1e-9);
      if (fixed.has(a)) {
        // Freeze this variable: identity row/col, zero step.
        for (let b = 0; b < n; b++) {
          JtJ[a][b] = a === b ? 1 : 0;
          JtJ[b][a] = a === b ? 1 : 0;
        }
        Jtr[a] = 0;
      }
    }
    const dx = solveLinear(JtJ, Jtr.map((v) => -v));
    if (!dx) {
      lambda *= 4;
      if (lambda > 1e12) break;
      continue;
    }
    const xNew = x.map((v, i) => v + dx[i]);
    const cNew = cost(evalResiduals(fns, xNew));
    if (cNew < c0) {
      x = xNew;
      lambda = Math.max(lambda * 0.5, 1e-9);
    } else {
      lambda *= 3;
      if (lambda > 1e12) break;
    }
  }

  const finalR = evalResiduals(fns, x);
  const rms = Math.sqrt(cost(finalR) / m);
  const freeVars = n - fixed.size;
  return {
    sketch: applyLayout(sketch, layout, x),
    residual: rms,
    iterations: iters,
    converged: rms < 1e-5,
    dof: Math.max(0, freeVars - m),
  };
}

/** Count the degrees of freedom left free by the current constraints. */
export function sketchDof(sketch: Sketch): number {
  const layout = buildLayout(sketch);
  const fns = buildResiduals(sketch, layout);
  return Math.max(0, layout.x.length - fns.length);
}

export type ConstraintStatus = "well" | "under" | "over" | "empty";

export function constraintStatus(result: SolveResult, sketch: Sketch): ConstraintStatus {
  if (sketch.constraints.length === 0) return "empty";
  if (!result.converged) return "over";
  return result.dof > 0 ? "under" : "well";
}

export function isPointRefEqual(a: PointRef, b: PointRef): boolean {
  return a.entity === b.entity && a.which === b.which;
}

export function findConstraint(
  sketch: Sketch,
  pred: (c: Constraint) => boolean,
): Constraint | undefined {
  return sketch.constraints.find(pred);
}
