/**
 * Data model for the vector editor.
 *
 * A document is a flat, ordered list of {@link VNode}s (z-order = array order,
 * last = top-most) rendered as SVG. Every node carries the same {@link Style}
 * fields plus a `rotation` (degrees, about the node's local bbox centre) and a
 * geometry payload specific to its `type`. Geometry is stored in *world*
 * (document) coordinates in the node's un-rotated local frame — rotation is
 * applied on top as an SVG `rotate(angle cx cy)` transform.
 *
 * The whole model is plain JSON (no class instances, no functions) so it can be
 * structuredClone()'d for history snapshots and JSON.stringify()'d for
 * localStorage autosave.
 *
 * Tier 2 added a batch of *optional* fields (grouping, layer metadata,
 * gradients, richer stroke, per-channel opacity, multi-line text, raster
 * images). They are all optional so older serialised scenes keep loading and
 * the render/serialise code can treat an absent field as its sensible default.
 */

export type Point = [number, number];

// ─── Paint ────────────────────────────────────────────────────────────────────

export interface GradientStop {
  /** 0..1 position along the gradient. */
  offset: number;
  color: string;
  /** 0..1 stop opacity (default 1). */
  opacity?: number;
}

/**
 * A fill gradient stored in objectBoundingBox space (coords are 0..1 relative
 * to the node's local bbox), so it scales and rotates with the node for free.
 * `angle` (degrees, 0 = left→right) drives the linear vector; radial gradients
 * emanate from the bbox centre.
 */
export interface Gradient {
  type: "linear" | "radial";
  stops: GradientStop[];
  /** Linear only: direction in degrees (0 = →, 90 = ↓). */
  angle?: number;
}

export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";
export type Marker = "none" | "arrow" | "dot";

/** Paint + opacity shared by every node. `null` fill/stroke means "none". */
export interface Style {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** Per-object opacity, 0..1. */
  opacity: number;
  // ── Tier 2 (all optional / backward-compatible) ──
  /** Gradient fill; when present it overrides the solid `fill`. */
  fillGradient?: Gradient | null;
  /** Per-channel opacity multipliers, 0..1 (default 1). */
  fillOpacity?: number;
  strokeOpacity?: number;
  /** Dash pattern in user units; empty/absent = solid. */
  strokeDash?: number[] | null;
  strokeCap?: StrokeCap;
  strokeJoin?: StrokeJoin;
  /** End-caps / arrowheads for open paths, lines and polylines. */
  markerStart?: Marker;
  markerEnd?: Marker;
}

/** Per-node metadata used by grouping and the layers panel. */
export interface NodeMeta {
  /** Human name shown in the layers panel (falls back to the type). */
  name?: string;
  /** Group membership id; nodes sharing an id move/select together. */
  groupId?: string | null;
  locked?: boolean;
  hidden?: boolean;
}

export type NodeType =
  | "rect"
  | "ellipse"
  | "line"
  | "polyline"
  | "path"
  | "text"
  | "image";

interface NodeBase extends Style, NodeMeta {
  id: string;
  type: NodeType;
  /** Clockwise rotation in degrees about the bbox centre. */
  rotation: number;
}

export interface RectNode extends NodeBase {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius (0 = sharp). */
  rx: number;
}

export interface EllipseNode extends NodeBase {
  type: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LineNode extends NodeBase {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Straight-segment poly-line / pen path. `closed` turns it into a polygon. */
export interface PolylineNode extends NodeBase {
  type: "polyline";
  points: Point[];
  closed: boolean;
}

/** Freehand stroke — rendered as a perfect-freehand filled outline. */
export interface PathNode extends NodeBase {
  type: "path";
  points: Point[];
}

export type TextAlign = "left" | "center" | "right";

export interface TextNode extends NodeBase {
  type: "text";
  x: number;
  y: number;
  /** May contain "\n" for multi-line / paragraph text. */
  text: string;
  fontSize: number;
  fontFamily: string;
  // ── Tier 2 typography (optional) ──
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  align?: TextAlign;
  /** Multiplier of font-size (default 1.2). */
  lineHeight?: number;
  /** Extra tracking in user units (default 0). */
  letterSpacing?: number;
}

/** Placed raster image (data-URL or remote href). */
export interface ImageNode extends NodeBase {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Image source — usually a data: URL so exports stay self-contained. */
  href: string;
}

export type VNode =
  | RectNode
  | EllipseNode
  | LineNode
  | PolylineNode
  | PathNode
  | TextNode
  | ImageNode;

/** A ruler-dragged guide line (either a vertical x or horizontal y). */
export interface Guide {
  id: string;
  axis: "x" | "y";
  /** Document-space position. */
  pos: number;
}

export interface VectorDoc {
  width: number;
  height: number;
  /** CSS colour, or the literal string "transparent". */
  background: string;
  /** Draggable guide lines. */
  guides?: Guide[];
}

export type ToolId =
  | "select"
  | "rect"
  | "rounded-rect"
  | "ellipse"
  | "line"
  | "polyline"
  | "pen"
  | "pencil"
  | "polygon"
  | "star"
  | "arc"
  | "spiral"
  | "text";

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** The complete, serialisable editor state React subscribes to. */
export interface VectorState {
  doc: VectorDoc;
  nodes: VNode[];
  /** Selected node ids. */
  selection: string[];
  tool: ToolId;
  view: Viewport;
  /** Default style applied to newly-created shapes. */
  defaults: Style;
  /** Default text properties. */
  textDefaults: { fontSize: number; fontFamily: string };
  /** Parameters for the polygon/star/spiral tools. */
  shapeDefaults: { polygonSides: number; starPoints: number; starInner: number; spiralTurns: number };
  grid: { size: number; show: boolean; snap: boolean; snapObjects: boolean; tolerance: number };
  /** Most-recently-used colours (newest first). */
  recentColors: string[];
  canUndo: boolean;
  canRedo: boolean;
}

/** The persisted document (everything except transient view/selection/tool). */
export interface VectorScene {
  doc: VectorDoc;
  nodes: VNode[];
}
