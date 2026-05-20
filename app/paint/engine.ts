/**
 * Paint engine.
 *
 * Owns two canvas elements (main + preview), the history stack, active-tool dispatch,
 * viewport transform (pan/zoom), and observable state for React UI.
 *
 * Usage:
 *   const engine = createEngine({ mainCanvas, previewCanvas, width, height });
 *   engine.store.subscribe(render);
 *   previewCanvas.addEventListener("pointerdown", engine.onPointerDown);
 *   // ... wire the other pointer events
 *   engine.dispose(); // on unmount
 */
import { createHistory } from "~/paint/lib/history";
import { createStore } from "~/paint/lib/store";
import type {
  EngineState,
  Modifiers,
  PaintContext,
  Tool,
  ToolId,
} from "~/paint/lib/types";
import { brush } from "~/paint/tools/brush";
import { pencil } from "~/paint/tools/pencil";
import { eraser } from "~/paint/tools/eraser";

// ─── Registry of available tools ────────────────────────────────────────────

const TOOLS: Record<ToolId, Tool> = {
  brush,
  pencil,
  eraser,
  // Placeholder stubs for tools added in later sub-tasks.
  // They will be replaced by real implementations in #27.
  line: { id: "line", cursor: "crosshair", onPointerDown() {}, onPointerMove() {}, onPointerUp() {} },
  rect: { id: "rect", cursor: "crosshair", onPointerDown() {}, onPointerMove() {}, onPointerUp() {} },
  ellipse: { id: "ellipse", cursor: "crosshair", onPointerDown() {}, onPointerMove() {}, onPointerUp() {} },
  fill: { id: "fill", cursor: "crosshair", onPointerDown() {}, onPointerMove() {}, onPointerUp() {} },
  eyedropper: { id: "eyedropper", cursor: "crosshair", onPointerDown() {}, onPointerMove() {}, onPointerUp() {} },
  text: { id: "text", cursor: "text", onPointerDown() {}, onPointerMove() {}, onPointerUp() {} },
};

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_STATE: EngineState = {
  tool: "brush",
  fg: "#1d4ed8",
  bg: "#ffffff",
  size: 8,
  brush: {
    smoothing: 0.5,
    streamline: 0.5,
    thinning: 0.5,
    taperStart: false,
    taperEnd: false,
  },
  eraserMode: "bg",
  shape: { stroke: true, fill: false },
  fillTolerance: 32,
  doc: { width: 1280, height: 720, bgWasTransparent: false },
  zoom: 1,
  panX: 0,
  panY: 0,
  cursorDoc: null,
  canUndo: false,
  canRedo: false,
  recentColours: [],
  autosaveAvailable: true,
};

// ─── Engine interface ─────────────────────────────────────────────────────────

export interface Engine {
  store: ReturnType<typeof createStore<EngineState>>;
  /** Call from React's useEffect/ref callback once both canvases are available. */
  mount(mainCanvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement): void;
  /** Call from the previewCanvas pointerdown handler. */
  onPointerDown(e: PointerEvent): void;
  onPointerMove(e: PointerEvent): void;
  onPointerUp(e: PointerEvent): void;
  /** Call on Esc or when the tool is switched mid-drag. */
  cancelDrag(): void;
  /** Set the active tool. */
  setTool(id: ToolId): void;
  setFg(c: string): void;
  setBg(c: string): void;
  setSize(n: number): void;
  setBrushOption<K extends keyof EngineState["brush"]>(key: K, value: EngineState["brush"][K]): void;
  setEraserMode(mode: "bg" | "erase"): void;
  undo(): void;
  redo(): void;
  /** Reset to a new document, optionally providing content. */
  newDocument(width: number, height: number, bg: string): void;
  isDragging: boolean;
  dispose(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEngine(): Engine {
  let mainCanvas: HTMLCanvasElement | null = null;
  let previewCanvas: HTMLCanvasElement | null = null;
  let mainCtx: CanvasRenderingContext2D | null = null;
  let previewCtx: CanvasRenderingContext2D | null = null;

  const store = createStore<EngineState>({ ...DEFAULT_STATE });
  let history = createHistory(DEFAULT_STATE.doc.width, DEFAULT_STATE.doc.height);

  // Modifiers — kept in sync by global keydown/keyup.
  const modifiers: Modifiers = { shift: false, alt: false, ctrl: false, meta: false };

  // Per-stroke scratchpad; reset on each pointerdown.
  const scratch: Record<string, unknown> = {};

  // Whether a pointer is currently dragging.
  let dragging = false;
  let activePointerId = -1;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function getState(): EngineState {
    return store.getSnapshot();
  }

  function updateState(updater: (s: EngineState) => EngineState): void {
    store.setState(updater);
  }

  /** Convert client (screen) coordinates to document pixel coordinates. */
  function toDocCoords(clientX: number, clientY: number): { x: number; y: number } {
    if (!previewCanvas) return { x: 0, y: 0 };
    const s = getState();
    const rect = previewCanvas.getBoundingClientRect();
    // Account for pan and zoom, which are applied as CSS transform on the canvas wrapper.
    // The CSS transform is: translate(panX, panY) scale(zoom) applied to the wrapper;
    // the canvas intrinsic size is doc.width × doc.height.
    // CSS displayed size = doc.width * zoom (approximately, ignoring pan for client rect).
    // Actually: getBoundingClientRect() already accounts for CSS transforms applied to the
    // element (it returns the visual rect). So we just scale from display to intrinsic.
    const scaleX = s.doc.width / rect.width;
    const scaleY = s.doc.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /** Build a PaintContext for a tool event. */
  function buildContext(): PaintContext | null {
    if (!mainCtx || !previewCtx) return null;
    const s = getState();

    return {
      main: mainCtx,
      preview: previewCtx,
      width: s.doc.width,
      height: s.doc.height,
      fg: s.fg,
      bg: s.bg,
      size: s.size,
      brush: s.brush,
      eraserMode: s.eraserMode,
      shape: s.shape,
      fillTolerance: s.fillTolerance,
      scratch,
      modifiers: { ...modifiers },

      toDocCoords,

      commitPreview() {
        if (!mainCtx || !previewCtx) return;
        const { width, height } = s.doc;
        mainCtx.drawImage(previewCtx.canvas, 0, 0);
        previewCtx.clearRect(0, 0, width, height);
        pushSnapshot();
      },

      pushHistory() {
        pushSnapshot();
      },

      setFg(c) {
        setFgInternal(c);
      },

      setBg(c) {
        updateState((st) => ({ ...st, bg: c }));
      },
    };
  }

  /** Snapshot main canvas state and push to history. */
  function pushSnapshot(): void {
    if (!mainCtx) return;
    const s = getState();
    const { width, height } = s.doc;
    const snap = mainCtx.getImageData(0, 0, width, height);
    history.push(snap);
    updateState((st) => ({
      ...st,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
    }));
  }

  /** Set the initial blank canvas and seed the history. */
  function initCanvas(width: number, height: number, bg: string): void {
    if (!mainCtx || !previewCtx) return;

    previewCtx.clearRect(0, 0, width, height);

    mainCtx.clearRect(0, 0, width, height);
    if (bg !== "transparent") {
      mainCtx.fillStyle = bg;
      mainCtx.fillRect(0, 0, width, height);
    }

    const seed = mainCtx.getImageData(0, 0, width, height);
    history.reset(seed);
    updateState((st) => ({
      ...st,
      canUndo: false,
      canRedo: false,
      doc: { width, height, bgWasTransparent: bg === "transparent" },
    }));
  }

  function setFgInternal(c: string): void {
    updateState((st) => {
      const recents = [c, ...st.recentColours.filter((x) => x !== c)].slice(0, 10);
      return { ...st, fg: c, recentColours: recents };
    });
  }

  // ─── Modifier tracking ──────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent): void {
    modifiers.shift = e.shiftKey;
    modifiers.alt = e.altKey;
    modifiers.ctrl = e.ctrlKey;
    modifiers.meta = e.metaKey;
  }

  function onKeyUp(e: KeyboardEvent): void {
    modifiers.shift = e.shiftKey;
    modifiers.alt = e.altKey;
    modifiers.ctrl = e.ctrlKey;
    modifiers.meta = e.metaKey;
  }

  // ─── Pointer pipeline ──────────────────────────────────────────────────────

  function onPointerDown(e: PointerEvent): void {
    if (dragging) return; // Ignore second pointer (pinch handled by viewport).
    if (!previewCanvas) return;
    previewCanvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    dragging = true;

    // Reset scratch on each new stroke.
    for (const key of Object.keys(scratch)) delete scratch[key];

    const ctx = buildContext();
    if (!ctx) return;

    const tool = TOOLS[getState().tool];
    tool.onPointerDown(e, ctx);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging || e.pointerId !== activePointerId) return;
    const ctx = buildContext();
    if (!ctx) return;

    // Update cursor position for status bar.
    const p = toDocCoords(e.clientX, e.clientY);
    updateState((st) => ({ ...st, cursorDoc: p }));

    const tool = TOOLS[getState().tool];
    tool.onPointerMove(e, ctx);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging || e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = -1;

    const ctx = buildContext();
    if (!ctx) return;

    const tool = TOOLS[getState().tool];
    tool.onPointerUp(e, ctx);
  }

  function cancelDrag(): void {
    if (!dragging) return;
    dragging = false;
    activePointerId = -1;

    const ctx = buildContext();
    if (!ctx) return;

    const tool = TOOLS[getState().tool];
    tool.onCancel?.(ctx);
  }

  // ─── Engine public API ──────────────────────────────────────────────────────

  const engine: Engine = {
    store,

    mount(mc, pc) {
      mainCanvas = mc;
      previewCanvas = pc;
      mainCtx = mc.getContext("2d")!;
      previewCtx = pc.getContext("2d")!;

      const s = getState();
      initCanvas(s.doc.width, s.doc.height, s.doc.bgWasTransparent ? "transparent" : s.bg);

      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("keyup", onKeyUp, true);
    },

    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancelDrag,

    get isDragging() {
      return dragging;
    },

    setTool(id) {
      if (dragging) engine.cancelDrag();
      updateState((st) => ({ ...st, tool: id }));
    },

    setFg: setFgInternal,

    setBg(c) {
      updateState((st) => ({ ...st, bg: c }));
    },

    setSize(n) {
      updateState((st) => ({ ...st, size: Math.max(1, Math.min(200, n)) }));
    },

    setBrushOption(key, value) {
      updateState((st) => ({
        ...st,
        brush: { ...st.brush, [key]: value },
      }));
    },

    setEraserMode(mode) {
      updateState((st) => ({ ...st, eraserMode: mode }));
    },

    undo() {
      if (!mainCtx) return;
      const snap = history.undo();
      if (!snap) return;
      mainCtx.putImageData(snap, 0, 0);
      updateState((st) => ({
        ...st,
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      }));
    },

    redo() {
      if (!mainCtx) return;
      const snap = history.redo();
      if (!snap) return;
      mainCtx.putImageData(snap, 0, 0);
      updateState((st) => ({
        ...st,
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
      }));
    },

    newDocument(width, height, bg) {
      if (!mainCtx || !previewCtx) return;
      mainCanvas!.width = width;
      previewCanvas!.width = width;
      mainCanvas!.height = height;
      previewCanvas!.height = height;
      history = createHistory(width, height);
      updateState((st) => ({
        ...st,
        doc: { width, height, bgWasTransparent: bg === "transparent" },
        bg: bg === "transparent" ? st.bg : bg,
      }));
      initCanvas(width, height, bg);
    },

    dispose() {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    },
  };

  return engine;
}
