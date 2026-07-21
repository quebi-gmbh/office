/**
 * The Manifold evaluation core, shared by the worker and the main-thread
 * fallback. Loads the WASM kernel lazily and turns a compiled {@link SolidOp}
 * list into a triangle mesh + metadata.
 */
import Module from "manifold-3d";
import type { ManifoldToplevel, Manifold, Mat4 } from "manifold-3d";
// Vite rewrites this to the emitted asset URL (respecting the deploy base).
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { MeshData, SolidOp } from "./protocol";

let kernel: Promise<ManifoldToplevel> | null = null;

export function loadKernel(): Promise<ManifoldToplevel> {
  if (!kernel) {
    kernel = Module({ locateFile: () => wasmUrl }).then((w) => {
      w.setup();
      return w;
    });
  }
  return kernel;
}

function localSolid(w: ManifoldToplevel, op: SolidOp): Manifold {
  const { Manifold, CrossSection } = w;
  const k = op.kind;
  switch (k.type) {
    case "box":
      return Manifold.cube(k.size, true);
    case "cylinder":
      return Manifold.cylinder(k.h, k.r, k.r, 0, true);
    case "sphere":
      return Manifold.sphere(k.r, 0);
    case "extrude": {
      const cs = new CrossSection(k.polygons as [number, number][][], "NonZero");
      const m = cs.extrude(k.height, 0, 0, [1, 1], k.center);
      cs.delete();
      return m;
    }
    case "revolve": {
      const cs = new CrossSection(k.polygons as [number, number][][], "NonZero");
      const m = cs.revolve(0, k.angleDeg);
      cs.delete();
      return m;
    }
  }
}

export interface EvalCoreResult {
  mesh: MeshData;
  bbox?: [number, number, number, number, number, number];
  volume: number;
  surfaceArea: number;
  triangles: number;
}

export function evaluateOps(
  w: ManifoldToplevel,
  ops: SolidOp[],
  quality?: number,
): EvalCoreResult {
  const { Manifold } = w;
  if (typeof quality === "number" && quality > 0) w.setMinCircularAngle(quality);

  let result: Manifold | null = null;
  for (const op of ops) {
    let m = localSolid(w, op);
    const placed = m.transform(op.transform as unknown as Mat4);
    m.delete();
    m = placed;
    if (m.isEmpty()) {
      m.delete();
      continue;
    }
    if (!result) {
      result = m;
    } else if (op.boolean === "subtract") {
      const r: Manifold = Manifold.difference(result, m);
      result.delete();
      m.delete();
      result = r;
    } else {
      const r: Manifold = Manifold.union(result, m);
      result.delete();
      m.delete();
      result = r;
    }
  }

  const empty: EvalCoreResult = {
    mesh: { position: new Float32Array(), index: new Uint32Array() },
    volume: 0,
    surfaceArea: 0,
    triangles: 0,
  };
  if (!result || result.isEmpty()) {
    result?.delete();
    return empty;
  }

  const mesh = result.getMesh();
  const numProp = mesh.numProp;
  const nVert = mesh.vertProperties.length / numProp;
  const position = new Float32Array(nVert * 3);
  for (let i = 0; i < nVert; i++) {
    position[i * 3] = mesh.vertProperties[i * numProp];
    position[i * 3 + 1] = mesh.vertProperties[i * numProp + 1];
    position[i * 3 + 2] = mesh.vertProperties[i * numProp + 2];
  }
  const index = new Uint32Array(mesh.triVerts);

  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    minx = Math.min(minx, position[i]);
    maxx = Math.max(maxx, position[i]);
    miny = Math.min(miny, position[i + 1]);
    maxy = Math.max(maxy, position[i + 1]);
    minz = Math.min(minz, position[i + 2]);
    maxz = Math.max(maxz, position[i + 2]);
  }
  const out: EvalCoreResult = {
    mesh: { position, index },
    bbox: [minx, miny, minz, maxx, maxy, maxz],
    volume: result.volume(),
    surfaceArea: result.surfaceArea(),
    triangles: index.length / 3,
  };
  result.delete();
  return out;
}
