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
 */

export type Point = [number, number];

/** Paint + opacity shared by every node. `null` fill/stroke means "none". */
export interface Style {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** Per-object opacity, 0..1. */
  opacity: number;
}

export type NodeType =
  | "rect"
  | "ellipse"
  | "line"
  | "polyline"
  | "path"
  | "text";

interface NodeBase extends Style {
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

export interface TextNode extends NodeBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
}

export type VNode =
  | RectNode
  | EllipseNode
  | LineNode
  | PolylineNode
  | PathNode
  | TextNode;

export interface VectorDoc {
  width: number;
  height: number;
  /** CSS colour, or the literal string "transparent". */
  background: string;
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
  | "text";

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
  grid: { size: number; show: boolean; snap: boolean };
  canUndo: boolean;
  canRedo: boolean;
}

/** The persisted document (everything except transient view/selection/tool). */
export interface VectorScene {
  doc: VectorDoc;
  nodes: VNode[];
}
