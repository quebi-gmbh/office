/**
 * Message protocol shared between the main thread and the Manifold worker.
 *
 * The main thread compiles the feature tree into a flat list of {@link SolidOp}
 * (pure geometry — see `lib/build.ts`) and posts it; the worker executes the
 * Manifold kernel and returns a triangle mesh plus metadata.
 */
import type { BooleanOp } from "../lib/types";

export type SolidOpKind =
  | { type: "box"; size: [number, number, number] }
  | { type: "cylinder"; r: number; h: number }
  | { type: "sphere"; r: number }
  | { type: "extrude"; polygons: number[][][]; height: number; center: boolean }
  | { type: "revolve"; polygons: number[][][]; angleDeg: number };

export interface SolidOp {
  /** Owning feature id (for error attribution). */
  id: string;
  kind: SolidOpKind;
  /** Column-major 4×4 world placement applied after local construction. */
  transform: number[];
  boolean: BooleanOp;
}

export interface EvalRequest {
  id: number;
  ops: SolidOp[];
  /** Minimum circular-segment angle in degrees (tessellation quality). */
  quality?: number;
}

export interface MeshData {
  /** Flat XYZ vertex positions. */
  position: Float32Array;
  /** Triangle vertex indices. */
  index: Uint32Array;
}

export interface EvalResult {
  id: number;
  ok: boolean;
  mesh?: MeshData;
  /** World-space bounding box [minx,miny,minz, maxx,maxy,maxz]. */
  bbox?: [number, number, number, number, number, number];
  volume?: number;
  surfaceArea?: number;
  triangles?: number;
  error?: string;
}
