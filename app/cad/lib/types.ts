/**
 * Data model for the light-CAD tool (`/cad`).
 *
 * A {@link CadDoc} is an ordered, parametric **feature tree**: sketches and
 * solid features evaluated top-to-bottom. Editing any feature re-evaluates the
 * ones after it. The whole model is plain JSON (no class instances, no
 * functions) so it can be `structuredClone()`d for history snapshots and
 * `JSON.stringify()`d for localStorage autosave / share-by-URL.
 *
 * Units are millimetres throughout. Sketch geometry lives in the sketch plane's
 * local 2-D frame `(u, v)` — `u` to the right, `v` up.
 */

/** The three base planes a sketch can live on. */
export type PlaneId = "XY" | "XZ" | "YZ";

/** A boolean combination mode applied when a solid feature is created. */
export type BooleanOp = "new" | "add" | "subtract";

// ─── Sketch entities ─────────────────────────────────────────────────────────

export interface LineEntity {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Open or closed chain of straight segments. `closed` turns it into a region. */
export interface PolylineEntity {
  id: string;
  type: "polyline";
  points: [number, number][];
  closed: boolean;
}

/** Axis-aligned rectangle (its own closed region). */
export interface RectEntity {
  id: string;
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleEntity {
  id: string;
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}

/** Circular arc from `a0` to `a1` (radians, CCW) at radius `r` about centre. */
export interface ArcEntity {
  id: string;
  type: "arc";
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
}

export type SketchEntity =
  | LineEntity
  | PolylineEntity
  | RectEntity
  | CircleEntity
  | ArcEntity;

export type SketchEntityType = SketchEntity["type"];

// ─── Constraints ─────────────────────────────────────────────────────────────

/**
 * A handle onto a specific point of an entity, used by geometric constraints.
 * `which` selects which of the entity's characteristic points is meant.
 */
export interface PointRef {
  entity: string;
  /** line: "start" | "end"; circle/arc: "center"; polyline: "p<index>". */
  which: string;
}

export type Constraint =
  | { id: string; type: "horizontal"; entity: string }
  | { id: string; type: "vertical"; entity: string }
  | { id: string; type: "coincident"; a: PointRef; b: PointRef }
  | { id: string; type: "distance"; a: PointRef; b: PointRef; value: number }
  | { id: string; type: "radius"; entity: string; value: number };

export type ConstraintType = Constraint["type"];

// ─── Features ────────────────────────────────────────────────────────────────

export interface Sketch {
  plane: PlaneId;
  entities: SketchEntity[];
  constraints: Constraint[];
}

export interface SketchFeature {
  id: string;
  type: "sketch";
  name: string;
  suppressed?: boolean;
  sketch: Sketch;
}

export interface ExtrudeFeature {
  id: string;
  type: "extrude";
  name: string;
  suppressed?: boolean;
  sketchId: string;
  depth: number;
  /** Extrude symmetrically about the sketch plane. */
  symmetric: boolean;
  /** Extrude the opposite direction instead of along the plane normal. */
  reverse: boolean;
  boolean: BooleanOp;
}

export interface RevolveFeature {
  id: string;
  type: "revolve";
  name: string;
  suppressed?: boolean;
  sketchId: string;
  /** Sweep angle in degrees (360 = full revolution). */
  angle: number;
  boolean: BooleanOp;
}

export interface BoxFeature {
  id: string;
  type: "box";
  name: string;
  suppressed?: boolean;
  w: number;
  d: number;
  h: number;
  /** World-space centre offset. */
  position: [number, number, number];
  boolean: BooleanOp;
}

export interface CylinderFeature {
  id: string;
  type: "cylinder";
  name: string;
  suppressed?: boolean;
  r: number;
  h: number;
  position: [number, number, number];
  boolean: BooleanOp;
}

export interface SphereFeature {
  id: string;
  type: "sphere";
  name: string;
  suppressed?: boolean;
  r: number;
  position: [number, number, number];
  boolean: BooleanOp;
}

export type PrimitiveFeature = BoxFeature | CylinderFeature | SphereFeature;

export type Feature =
  | SketchFeature
  | ExtrudeFeature
  | RevolveFeature
  | PrimitiveFeature;

export type FeatureType = Feature["type"];

export interface CadDoc {
  name: string;
  features: Feature[];
}

/** The persisted document — the model plus a schema version. */
export interface CadScene {
  version: number;
  doc: CadDoc;
}
