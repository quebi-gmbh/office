// Shared types for the paint engine.
// Tools, UI, and the engine itself all import from here.
// Nothing here imports from ui/ — keep this layer clean.

export type ToolId =
  | "brush"
  | "pencil"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse"
  | "fill"
  | "eyedropper"
  | "text"
  | "select";

/** 9-point anchor for canvas resize (where existing pixels land in the new canvas). */
export type AnchorPoint =
  | "top-left"    | "top"    | "top-right"
  | "left"        | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right";

export interface BrushOptions {
  smoothing: number;    // 0–1
  streamline: number;   // 0–1
  thinning: number;     // -1–1
  /** start.taper value passed to perfect-freehand */
  taperStart: number | boolean;
  /** end.taper value passed to perfect-freehand */
  taperEnd: number | boolean;
}

export interface ShapeOptions {
  stroke: boolean;
  fill: boolean;
}

export interface DocInfo {
  width: number;
  height: number;
  bgWasTransparent: boolean;
}

/** A committed rectangular selection in document pixel coordinates (normalised, clamped). */
export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mutable engine state read by React components via useSyncExternalStore. */
export interface EngineState {
  tool: ToolId;
  fg: string;       // #rrggbb (always lowercase, always 6-digit hex)
  bg: string;       // #rrggbb or "transparent"
  size: number;     // brush/pencil/eraser radius in doc pixels
  brush: BrushOptions;
  eraserMode: "bg" | "erase";
  shape: ShapeOptions;
  fillTolerance: number; // 0–255
  doc: DocInfo;
  zoom: number;     // CSS scale factor, e.g. 1 = 100 %
  panX: number;     // canvas translation in CSS px
  panY: number;
  cursorDoc: { x: number; y: number } | null;
  canUndo: boolean;
  canRedo: boolean;
  recentColours: string[]; // up to 10, most recent first
  autosaveAvailable: boolean;
  /** When the text tool requests an overlay, this holds the click position in doc space. */
  textOverlay: { x: number; y: number; fontSize: number; fontFamily: string } | null;
  /** Currently committed marquee selection, or null if none. Lives outside history. */
  selection: SelectionRect | null;
}

/** Keyboard modifier state, kept in sync by the engine. */
export interface Modifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

/**
 * Context passed to every tool handler.
 * Tools must not import anything from app/paint/ui/ or react.
 */
export interface PaintContext {
  main: CanvasRenderingContext2D;
  preview: CanvasRenderingContext2D;
  width: number;
  height: number;
  fg: string;
  bg: string;
  size: number;
  /** Current brush options (forwarded from EngineState). */
  brush: BrushOptions;
  /** Current eraser mode. */
  eraserMode: "bg" | "erase";
  /** Current shape options. */
  shape: ShapeOptions;
  /** Flood-fill tolerance. */
  fillTolerance: number;
  /**
   * Tool-local mutable scratchpad.
   * Initialised to {} when a new pointerdown begins.
   * Survives down→move→up but is cleared on tool switch.
   */
  scratch: Record<string, unknown>;
  /**
   * Composite preview canvas onto main, clear preview, then push a history snapshot.
   * Call this from onPointerUp (or shape commit) when the action is complete.
   */
  commitPreview(): void;
  /**
   * Push a history snapshot without compositing preview.
   * Use for fill, eyedropper, text-commit, import — actions that write directly to main.
   */
  pushHistory(): void;
  /** Convert client coordinates to document-space pixel coordinates. */
  toDocCoords(clientX: number, clientY: number): { x: number; y: number };
  modifiers: Modifiers;
  setFg(c: string): void;
  setBg(c: string): void;
  setSelection(rect: SelectionRect): void;
  clearSelection(): void;
}

/** Interface every tool module must satisfy. */
export interface Tool {
  id: ToolId;
  /** CSS cursor string; may be a data-URL for custom cursors. */
  cursor: string;
  onPointerDown(e: PointerEvent, ctx: PaintContext): void;
  onPointerMove(e: PointerEvent, ctx: PaintContext): void;
  onPointerUp(e: PointerEvent, ctx: PaintContext): void;
  /** Called when the user presses Esc or the tool is switched mid-drag. */
  onCancel?(ctx: PaintContext): void;
}
