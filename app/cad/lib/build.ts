/**
 * Compile a parametric feature tree into a flat list of {@link SolidOp} for the
 * Manifold worker. Pure and deterministic: sketches are turned into closed
 * profiles here (on the main thread) so the worker only runs kernel operations.
 */
import type { SolidOp } from "../kernel/protocol";
import { extrudeMatrix, profilesFromSketch, revolveMatrix } from "./geometry";
import type { CadDoc, PlaneId, SketchFeature } from "./types";

/** Identity 4×4 with an optional translation. */
function translation(x = 0, y = 0, z = 0): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** Set the translation column of a column-major 4×4 (returns a new array). */
function withTranslation(m: number[], t: [number, number, number]): number[] {
  const out = m.slice();
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  return out;
}

function planeNormal(plane: PlaneId): [number, number, number] {
  switch (plane) {
    case "XY":
      return [0, 0, 1];
    case "XZ":
      return [0, -1, 0];
    case "YZ":
      return [1, 0, 0];
  }
}

export interface BuildResult {
  ops: SolidOp[];
  /** Human-readable warnings (e.g. a sketch with no closed profile). */
  warnings: string[];
}

export function buildOps(doc: CadDoc): BuildResult {
  const ops: SolidOp[] = [];
  const warnings: string[] = [];
  const sketches = new Map<string, SketchFeature>();
  for (const f of doc.features) if (f.type === "sketch") sketches.set(f.id, f);

  for (const f of doc.features) {
    if (f.suppressed) continue;
    switch (f.type) {
      case "sketch":
        break;
      case "box":
        ops.push({
          id: f.id,
          kind: { type: "box", size: [f.w, f.d, f.h] },
          transform: translation(...f.position),
          boolean: f.boolean,
        });
        break;
      case "cylinder":
        ops.push({
          id: f.id,
          kind: { type: "cylinder", r: f.r, h: f.h },
          transform: translation(...f.position),
          boolean: f.boolean,
        });
        break;
      case "sphere":
        ops.push({
          id: f.id,
          kind: { type: "sphere", r: f.r },
          transform: translation(...f.position),
          boolean: f.boolean,
        });
        break;
      case "extrude": {
        const s = sketches.get(f.sketchId);
        if (!s) {
          warnings.push(`${f.name}: sketch not found`);
          break;
        }
        const polys = profilesFromSketch(s.sketch).map((p) => p.map((pt) => [pt[0], pt[1]]));
        if (polys.length === 0) {
          warnings.push(`${f.name}: sketch has no closed profile`);
          break;
        }
        const n = planeNormal(s.sketch.plane);
        const depth = Math.abs(f.depth);
        let transform = extrudeMatrix(s.sketch.plane);
        if (f.reverse && !f.symmetric) {
          transform = withTranslation(transform, [-depth * n[0], -depth * n[1], -depth * n[2]]);
        }
        ops.push({
          id: f.id,
          kind: { type: "extrude", polygons: polys, height: depth, center: f.symmetric },
          transform,
          boolean: f.boolean,
        });
        break;
      }
      case "revolve": {
        const s = sketches.get(f.sketchId);
        if (!s) {
          warnings.push(`${f.name}: sketch not found`);
          break;
        }
        const polys = profilesFromSketch(s.sketch).map((p) => p.map((pt) => [pt[0], pt[1]]));
        if (polys.length === 0) {
          warnings.push(`${f.name}: sketch has no closed profile`);
          break;
        }
        ops.push({
          id: f.id,
          kind: { type: "revolve", polygons: polys, angleDeg: f.angle },
          transform: revolveMatrix(s.sketch.plane),
          boolean: f.boolean,
        });
        break;
      }
    }
  }

  return { ops, warnings };
}
