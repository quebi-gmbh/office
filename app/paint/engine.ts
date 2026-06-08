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
import { loadColourPrefs, saveColourPrefs, addToRecents } from "~/paint/lib/colourStore";
import type {
  AnchorPoint,
  EngineState,
  Modifiers,
  PaintContext,
  SelectionRect,
  Tool,
  ToolId,
} from "~/paint/lib/types";
import { brush } from "~/paint/tools/brush";
import { pencil } from "~/paint/tools/pencil";
import { eraser } from "~/paint/tools/eraser";
import { line } from "~/paint/tools/line";
import { rect } from "~/paint/tools/rect";
import { ellipse } from "~/paint/tools/ellipse";
import { fill } from "~/paint/tools/fill";
import { eyedropper } from "~/paint/tools/eyedropper";
import { text } from "~/paint/tools/text";
import { select } from "~/paint/tools/select";
import { copyToClipboard } from "~/paint/io/export";

// ─── Registry of available tools ────────────────────────────────────────────

const TOOLS: Record<ToolId, Tool> = {
  brush,
  pencil,
  eraser,
  line,
  rect,
  ellipse,
  fill,
  eyedropper,
  text,
  select,
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
  textOverlay: null,
  selection: null,
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
  setShapeOption<K extends keyof EngineState["shape"]>(key: K, value: EngineState["shape"][K]): void;
  setFillTolerance(n: number): void;
  /**
   * Rasterise a text string onto the main canvas at the current overlay position.
   * Called by TextOverlay when the user commits (blur / Enter).
   */
  commitText(text: string, fontSize: number, fontFamily: string): void;
  /** Dismiss the text overlay without rasterising. */
  cancelText(): void;
  undo(): void;
  redo(): void;
  /** Reset to a new document, optionally providing content. */
  newDocument(width: number, height: number, bg: string): void;
  /** Viewport shortcut callbacks — set by the viewport hook after mount. */
  fitViewport?(): void;
  resetZoom?(): void;
  /** Export shortcuts — set by PaintApp after mount. */
  openExportDialog?(): void;
  quickSavePng?(): void;
  /** New-document dialog — set by PaintApp after mount. */
  openNewDialog?(): void;
  /** Push a history snapshot immediately (used after external canvas writes, e.g. import). */
  snapshotNow(): void;
  isDragging: boolean;
  dispose(): void;

  // ── Selection
  setSelection(rect: SelectionRect): void;
  clearSelection(): void;
  selectAll(): void;

  // ── Clipboard
  copySelection(): Promise<void>;
  cutSelection(): Promise<void>;
  clearRegion(rect?: SelectionRect): void;

  // ── Canvas sizing (each is one undoable step)
  cropToSelection(): void;
  resizeCanvas(w: number, h: number, anchor: AnchorPoint): void;
  scaleImage(w: number, h: number): void;
  trimTransparent(): void;
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

  // Marching-ants animation state.
  let rafId = 0;
  let dashOffset = 0;
  let antsLastTime = -1;

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
    const r = previewCanvas.getBoundingClientRect();
    const scaleX = s.doc.width / r.width;
    const scaleY = s.doc.height / r.height;
    return {
      x: (clientX - r.left) * scaleX,
      y: (clientY - r.top) * scaleY,
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
        updateState((st) => {
          saveColourPrefs({ fg: st.fg, bg: c, recents: st.recentColours });
          return { ...st, bg: c };
        });
      },

      setSelection(r) {
        setSelectionInternal(r);
      },

      clearSelection() {
        clearSelectionInternal();
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
      const recents = addToRecents(st.recentColours, c);
      const next = { ...st, fg: c, recentColours: recents };
      saveColourPrefs({ fg: c, bg: st.bg, recents });
      return next;
    });
  }

  function setSelectionInternal(r: SelectionRect): void {
    updateState((st) => ({ ...st, selection: r }));
  }

  function clearSelectionInternal(): void {
    updateState((st) => ({ ...st, selection: null }));
  }

  // ─── Marching-ants rAF loop ────────────────────────────────────────────────

  function animateAnts(time: number): void {
    rafId = requestAnimationFrame(animateAnts);
    if (!previewCtx) return;

    // While a pointer drag is in progress, the active tool owns the preview canvas.
    if (dragging) return;

    const s = getState();
    const { width, height } = s.doc;

    if (!s.selection) {
      // If we were drawing ants before, clear them. We track this by checking
      // whether dashOffset has advanced (i.e. the loop has been running).
      if (antsLastTime >= 0) {
        previewCtx.clearRect(0, 0, width, height);
        antsLastTime = -1;
      }
      return;
    }

    // Advance the dash offset for animation (~20 px/s).
    if (antsLastTime < 0) antsLastTime = time;
    const dt = time - antsLastTime;
    antsLastTime = time;
    dashOffset = (dashOffset + dt * 0.02) % 8;

    const { x, y, w, h } = s.selection;
    previewCtx.clearRect(0, 0, width, height);
    previewCtx.save();
    previewCtx.lineWidth = 1;
    previewCtx.setLineDash([4, 4]);
    // White dashes
    previewCtx.strokeStyle = "rgba(255,255,255,0.9)";
    previewCtx.lineDashOffset = -dashOffset;
    previewCtx.strokeRect(x + 0.5, y + 0.5, w, h);
    // Black dashes interleaved
    previewCtx.strokeStyle = "rgba(0,0,0,0.9)";
    previewCtx.lineDashOffset = -dashOffset + 4;
    previewCtx.strokeRect(x + 0.5, y + 0.5, w, h);
    previewCtx.restore();
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

    // Text tool signals overlay request via scratch.
    if (scratch.requestOverlay) {
      scratch.requestOverlay = false;
      updateState((st) => ({
        ...st,
        textOverlay: {
          x: scratch.textX as number,
          y: scratch.textY as number,
          fontSize: 24,
          fontFamily: "sans-serif",
        },
      }));
    }
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

  // ─── Canvas resize helper ─────────────────────────────────────────────────
  //
  // Resize both canvases to (newW × newH), call paint() to draw new content
  // from the old pixels, update doc state, and push one history snapshot.
  // Undo/redo will restore the previous snapshot — including its dimensions.

  function applyResize(
    newW: number,
    newH: number,
    paint: (ctx: CanvasRenderingContext2D, old: HTMLCanvasElement) => void,
  ): void {
    if (!mainCtx || !previewCtx || !mainCanvas || !previewCanvas) return;

    // Capture current pixels into an offscreen canvas before resizing.
    const offscreen = document.createElement("canvas");
    offscreen.width = mainCanvas.width;
    offscreen.height = mainCanvas.height;
    offscreen.getContext("2d")!.drawImage(mainCanvas, 0, 0);

    // Resizing a canvas element clears it.
    mainCanvas.width = newW;
    mainCanvas.height = newH;
    previewCanvas.width = newW;
    previewCanvas.height = newH;

    // Let the caller paint new content from the old pixels.
    paint(mainCtx, offscreen);

    // Update observable doc dimensions (pushSnapshot reads these).
    updateState((st) => ({
      ...st,
      doc: { ...st.doc, width: newW, height: newH },
    }));

    // One history snapshot at the new dimensions.
    pushSnapshot();
  }

  // ─── Engine public API ──────────────────────────────────────────────────────

  const engine: Engine = {
    store,

    mount(mc, pc) {
      mainCanvas = mc;
      previewCanvas = pc;
      mainCtx = mc.getContext("2d")!;
      previewCtx = pc.getContext("2d")!;

      // Restore persisted colour preferences.
      const colourPrefs = loadColourPrefs();
      updateState((st) => ({
        ...st,
        fg: colourPrefs.fg,
        bg: colourPrefs.bg,
        recentColours: colourPrefs.recents,
      }));

      const s = getState();
      initCanvas(s.doc.width, s.doc.height, s.doc.bgWasTransparent ? "transparent" : s.bg);

      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("keyup", onKeyUp, true);

      // Start the marching-ants rAF loop.
      rafId = requestAnimationFrame(animateAnts);
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
      updateState((st) => {
        saveColourPrefs({ fg: st.fg, bg: c, recents: st.recentColours });
        return { ...st, bg: c };
      });
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

    setShapeOption(key, value) {
      updateState((st) => ({ ...st, shape: { ...st.shape, [key]: value } }));
    },

    setFillTolerance(n) {
      updateState((st) => ({ ...st, fillTolerance: Math.max(0, Math.min(255, n)) }));
    },

    commitText(textContent, fontSize, fontFamily) {
      if (!mainCtx) return;
      const s = getState();
      if (!s.textOverlay) return;

      const lines = textContent.split("\n");
      mainCtx.save();
      mainCtx.font = `${fontSize}px ${fontFamily}`;
      mainCtx.fillStyle = s.fg;
      mainCtx.textBaseline = "top";
      lines.forEach((ln, i) => {
        mainCtx!.fillText(ln, s.textOverlay!.x, s.textOverlay!.y + i * (fontSize * 1.2));
      });
      mainCtx.restore();

      updateState((st) => ({ ...st, textOverlay: null }));
      pushSnapshot();
    },

    cancelText() {
      updateState((st) => ({ ...st, textOverlay: null }));
    },

    undo() {
      if (!mainCtx || !mainCanvas || !previewCanvas) return;
      const snap = history.undo();
      if (!snap) return;
      // Dimension-aware restore: resize canvases if the snapshot is a different size.
      if (snap.width !== mainCanvas.width || snap.height !== mainCanvas.height) {
        mainCanvas.width = snap.width;
        mainCanvas.height = snap.height;
        previewCanvas.width = snap.width;
        previewCanvas.height = snap.height;
      }
      mainCtx.putImageData(snap, 0, 0);
      updateState((st) => ({
        ...st,
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
        doc: { ...st.doc, width: snap.width, height: snap.height },
      }));
    },

    redo() {
      if (!mainCtx || !mainCanvas || !previewCanvas) return;
      const snap = history.redo();
      if (!snap) return;
      // Dimension-aware restore.
      if (snap.width !== mainCanvas.width || snap.height !== mainCanvas.height) {
        mainCanvas.width = snap.width;
        mainCanvas.height = snap.height;
        previewCanvas.width = snap.width;
        previewCanvas.height = snap.height;
      }
      mainCtx.putImageData(snap, 0, 0);
      updateState((st) => ({
        ...st,
        canUndo: history.canUndo(),
        canRedo: history.canRedo(),
        doc: { ...st.doc, width: snap.width, height: snap.height },
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
        selection: null,
      }));
      initCanvas(width, height, bg);
    },

    fitViewport: undefined,
    resetZoom: undefined,
    openExportDialog: undefined,
    quickSavePng: undefined,
    openNewDialog: undefined,
    snapshotNow: pushSnapshot,

    // ── Selection

    setSelection(r) {
      setSelectionInternal(r);
    },

    clearSelection() {
      clearSelectionInternal();
    },

    selectAll() {
      const s = getState();
      setSelectionInternal({ x: 0, y: 0, w: s.doc.width, h: s.doc.height });
    },

    // ── Clipboard

    async copySelection() {
      if (!mainCtx || !mainCanvas) return;
      const s = getState();
      const region = s.selection ?? { x: 0, y: 0, w: s.doc.width, h: s.doc.height };

      // Draw the region into an offscreen canvas and copy it to the system clipboard.
      const offscreen = document.createElement("canvas");
      offscreen.width = region.w;
      offscreen.height = region.h;
      offscreen.getContext("2d")!.drawImage(mainCanvas, -region.x, -region.y);
      await copyToClipboard(offscreen);
    },

    async cutSelection() {
      const s = getState();
      await engine.copySelection();
      engine.clearRegion(s.selection ?? undefined);
    },

    clearRegion(region) {
      if (!mainCtx) return;
      const s = getState();
      const r = region ?? { x: 0, y: 0, w: s.doc.width, h: s.doc.height };
      mainCtx.save();
      if (!s.doc.bgWasTransparent && s.bg !== "transparent") {
        // Fill with background colour.
        mainCtx.fillStyle = s.bg;
        mainCtx.fillRect(r.x, r.y, r.w, r.h);
      } else {
        mainCtx.clearRect(r.x, r.y, r.w, r.h);
      }
      mainCtx.restore();
      pushSnapshot();
    },

    // ── Canvas sizing

    cropToSelection() {
      const s = getState();
      if (!s.selection) return;
      const { x, y, w, h } = s.selection;
      applyResize(w, h, (ctx, old) => {
        ctx.drawImage(old, -x, -y);
      });
      clearSelectionInternal();
    },

    resizeCanvas(w, h, anchor) {
      const s = getState();
      const oldW = s.doc.width;
      const oldH = s.doc.height;

      // Compute offset of existing content based on 9-point anchor.
      const dx = anchor.includes("right")
        ? w - oldW
        : anchor.includes("left")
          ? 0
          : Math.round((w - oldW) / 2);
      const dy = anchor.includes("bottom")
        ? h - oldH
        : anchor.includes("top")
          ? 0
          : Math.round((h - oldH) / 2);

      applyResize(w, h, (ctx, old) => {
        if (!s.doc.bgWasTransparent && s.bg !== "transparent") {
          ctx.fillStyle = s.bg;
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(old, dx, dy);
      });
    },

    scaleImage(w, h) {
      applyResize(w, h, (ctx, old) => {
        ctx.drawImage(old, 0, 0, w, h);
      });
    },

    trimTransparent() {
      if (!mainCtx) return;
      const s = getState();
      const { width, height } = s.doc;
      const imageData = mainCtx.getImageData(0, 0, width, height);
      const { data } = imageData;

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const alpha = data[(py * width + px) * 4 + 3];
          if (alpha > 0) {
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
      }

      // Nothing visible, or already at full extent — no-op.
      if (maxX < 0 || maxY < 0) return;
      if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return;

      const newW = maxX - minX + 1;
      const newH = maxY - minY + 1;
      applyResize(newW, newH, (ctx, old) => {
        ctx.drawImage(old, -minX, -minY);
      });
    },

    dispose() {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      cancelAnimationFrame(rafId);
    },
  };

  return engine;
}
