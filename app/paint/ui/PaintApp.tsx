/**
 * Root composition component for the paint tool.
 * Wires together: engine, viewport, shortcuts, autosave, import/export, restore.
 */
import { useCallback, useRef, useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { usePaintEngine } from "~/paint/hooks/usePaintEngine";
import { useShortcuts } from "~/paint/hooks/useShortcuts";
import { useViewport } from "~/paint/hooks/useViewport";
import { Toolbar } from "~/paint/ui/Toolbar";
import { StatusBar } from "~/paint/ui/StatusBar";
import { TextOverlay } from "~/paint/ui/TextOverlay";
import { HelpModal } from "~/paint/ui/HelpModal";
import { NewDocDialog } from "~/paint/ui/NewDocDialog";
import { ImportDialog } from "~/paint/ui/ImportDialog";
import { ExportDialog } from "~/paint/ui/ExportDialog";
import { CanvasSizeDialog } from "~/paint/ui/CanvasSizeDialog";
import { RestoreBanner } from "~/paint/ui/RestoreBanner";
import { CanvasScrollbars } from "~/paint/ui/CanvasScrollbars";
import {
  fileToImageBitmap,
  dataTransferItemToImageBitmap,
  clipboardToImageBitmap,
  type PlacementMode,
} from "~/paint/io/import";
import { canvasToBlob, downloadBlob, defaultFilename } from "~/paint/io/export";
import {
  createAutosave,
  loadAutosave,
  loadSession,
  rotateSession,
  clearAllAutosaveData,
} from "~/paint/io/autosave";
import {
  usePendingFileOpen,
  useUnsavedGuard,
  writeBlob,
  type WsFileRef,
} from "~/lib/workspace";

type ImageMime = "image/png" | "image/jpeg" | "image/webp";

function mimeFromName(name: string): ImageMime {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export function PaintApp() {
  const { engine, state, mainRef, previewRef } = usePaintEngine();
  const { helpOpen, setHelpOpen } = useShortcuts(engine);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [pendingBitmap, setPendingBitmap] = useState<ImageBitmap | null>(null);
  const [restoreSession, setRestoreSession] = useState<string | null>(null);

  const viewport = useViewport(engine);
  const [canvasScale, setCanvasScale] = useState(1);
  const outerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosave instance — stable ref.
  const autosaveRef = useRef(createAutosave());

  // Workspace file handle (set when opened from the folder sidebar).
  const wsHandleRef = useRef<WsFileRef | null>(null);
  // Dirty since the workspace image was opened/saved (for the unsaved guard).
  const [wsDirty, setWsDirty] = useState(false);
  const wsMimeRef = useRef<ImageMime>("image/png");
  const [wsFileName, setWsFileName] = useState<string | null>(null);

  // ─── Viewport wiring ──────────────────────────────────────────────────────

  useEffect(() => {
    engine.fitViewport = () => viewport.apply(viewport.fit());
    engine.resetZoom = () => viewport.apply(viewport.oneToOne());
  }, [engine, viewport]);

  // Fit the canvas to the viewport once on mount only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { engine.fitViewport?.(); }, []);

  // ─── Export wiring ─────────────────────────────────────────────────────────

  useEffect(() => {
    engine.openExportDialog = () => setExportOpen(true);
    engine.quickSavePng = async () => {
      // Prefer writing back to an open workspace file; otherwise download.
      if (await saveToWorkspaceFile()) return;
      const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
      if (!canvas) return;
      const blob = await canvasToBlob(canvas, "image/png", 1);
      downloadBlob(blob, defaultFilename("image/png"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Write the current canvas back to the workspace file handle, matching the
  // file's original format. Returns false when no workspace file is open.
  async function saveToWorkspaceFile(): Promise<boolean> {
    const ref = wsHandleRef.current;
    if (!ref) return false;
    const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
    if (!canvas) return false;
    const blob = await canvasToBlob(canvas, wsMimeRef.current, 1);
    await writeBlob(ref, blob);
    setWsDirty(false);
    return true;
  }

  // ─── Workspace: open an image handed off from the folder sidebar ───────────
  usePendingFileOpen("paint", async ({ ref, name, file }) => {
    const bitmap = await fileToImageBitmap(file);
    wsHandleRef.current = ref;
    wsMimeRef.current = mimeFromName(name);
    setWsFileName(name);
    replaceWithBitmap(bitmap);
    setWsDirty(false);
  });

  useUnsavedGuard({
    dirty: !!wsFileName && wsDirty,
    name: wsFileName ?? "Untitled",
    save: async () => {
      await saveToWorkspaceFile();
      return true;
    },
  });

  // ─── New-doc dialog wiring ─────────────────────────────────────────────────

  useEffect(() => {
    engine.openNewDialog = () => setNewDocOpen(true);
  }, [engine]);

  // ─── Autosave ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const autosave = autosaveRef.current;

    // Check for a restorable session on mount.
    const session = loadSession();
    if (session) {
      setRestoreSession(session.sessionId);
    } else {
      // No existing session → start a fresh one.
      rotateSession();
    }

    autosave.start(
      () => document.querySelector<HTMLCanvasElement>(".paint-canvas-main"),
      () => engine.store.getSnapshot(),
      () => engine.isDragging,
    );

    return () => autosave.stop();
  }, [engine]);

  // Reset idle timer on pointer activity.
  const notifyActivity = useCallback(() => {
    autosaveRef.current.pointerActivity();
    if (wsHandleRef.current) setWsDirty(true);
  }, []);

  // ─── Canvas scale for text overlay ────────────────────────────────────────

  useEffect(() => {
    const wrap = viewport.wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasScale(entry.contentRect.width / state.doc.width);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [state.doc.width, viewport.wrapRef]);

  // ─── Pointer forwarding ───────────────────────────────────────────────────

  // Set for the lifetime of a drag that the viewport claimed as a pan (hand tool
  // or Space-hold), so the whole down→move→up sequence is withheld from the
  // engine — otherwise the active tool would paint along the pan path.
  const panGestureRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      panGestureRef.current = viewport.isPanGesture();
      if (panGestureRef.current) return;
      notifyActivity();
      engine.onPointerDown(e.nativeEvent);
    },
    [engine, notifyActivity, viewport],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (panGestureRef.current) return;
      engine.onPointerMove(e.nativeEvent);
    },
    [engine],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (panGestureRef.current) {
        panGestureRef.current = false;
        return;
      }
      notifyActivity();
      engine.onPointerUp(e.nativeEvent);
    },
    [engine, notifyActivity],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons === 0) return;
      engine.cancelDrag();
    },
    [engine],
  );

  // ─── Import: file picker ──────────────────────────────────────────────────

  async function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = ""; // reset so same file can be re-picked
    const bitmap = await fileToImageBitmap(files[0]);
    handleIncomingBitmap(bitmap);
  }

  // ─── Import: drag-drop ────────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) {
    // Must preventDefault to allow drop.
    if (e.dataTransfer.types.some((t) => t.startsWith("image/") || t === "Files")) {
      e.preventDefault();
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    for (const item of e.dataTransfer.items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file?.type.startsWith("image/")) {
          const bitmap = await fileToImageBitmap(file);
          handleIncomingBitmap(bitmap);
          return;
        }
      }
    }
  }

  // ─── Import: paste ────────────────────────────────────────────────────────

  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      // Check clipboard items for an image.
      if (e.clipboardData) {
        for (const item of e.clipboardData.items) {
          const bitmap = await dataTransferItemToImageBitmap(item);
          if (bitmap) {
            handleIncomingBitmap(bitmap);
            return;
          }
        }
      }
      // Fallback: clipboard API (Chrome requires permission; Firefox may be disabled).
      const bitmap = await clipboardToImageBitmap();
      if (bitmap) handleIncomingBitmap(bitmap);
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Smart import routing ─────────────────────────────────────────────────
  //
  // If the document is untouched (blank / no undo history), silently replace it
  // with the incoming image at the image's native size — no dialog.
  // If the document has content, show the fit/centre/replace placement dialog.

  function handleIncomingBitmap(bitmap: ImageBitmap) {
    const s = engine.store.getSnapshot();
    if (!s.canUndo) {
      // Blank canvas — auto-replace at the image's native dimensions.
      replaceWithBitmap(bitmap);
    } else {
      // Existing artwork — ask the user how to place it.
      setPendingBitmap(bitmap);
    }
  }

  /** Resize the canvas to match the bitmap and draw it. No placement dialog. */
  function replaceWithBitmap(bitmap: ImageBitmap) {
    const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
    if (!canvas) return;
    const s = engine.store.getSnapshot();
    // newDocument changes state.doc.{width,height}, which drives the <canvas>
    // width/height props. flushSync forces React to commit those attributes
    // NOW — writing a canvas's width/height clears its bitmap, so if we drew
    // before the commit React's re-render would wipe the image (blank paste).
    flushSync(() => {
      engine.newDocument(bitmap.width, bitmap.height, s.doc.bgWasTransparent ? "transparent" : s.bg);
    });
    const freshCtx = canvas.getContext("2d")!;
    freshCtx.drawImage(bitmap, 0, 0);
    engine.store.setState((st) => ({ ...st, canUndo: false, canRedo: false }));
    engine.snapshotNow();
    rotateSession();
    engine.fitViewport?.();
  }

  // ─── Import placement (when the dialog is shown) ──────────────────────────

  function applyImport(bitmap: ImageBitmap, mode: PlacementMode) {
    const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const s = engine.store.getSnapshot();

    if (mode === "replace") {
      replaceWithBitmap(bitmap);
    } else if (mode === "fit") {
      const scale = Math.min(s.doc.width / bitmap.width, s.doc.height / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      const x = (s.doc.width - w) / 2;
      const y = (s.doc.height - h) / 2;
      ctx.drawImage(bitmap, x, y, w, h);
      engine.snapshotNow();
      rotateSession();
    } else {
      // centre
      const x = (s.doc.width - bitmap.width) / 2;
      const y = (s.doc.height - bitmap.height) / 2;
      ctx.drawImage(bitmap, x, y);
      engine.snapshotNow();
      rotateSession();
    }

    setPendingBitmap(null);
  }

  // ─── Restore ──────────────────────────────────────────────────────────────

  async function handleRestore() {
    if (!restoreSession) return;
    setRestoreSession(null);
    const saved = await loadAutosave(restoreSession);
    if (!saved) return;

    const bitmap = await createImageBitmap(saved.png);
    // flushSync so React commits the new canvas dimensions before we draw;
    // otherwise the re-render rewrites width/height and clears the bitmap.
    flushSync(() => {
      engine.newDocument(saved.doc.width, saved.doc.height, saved.doc.bgWasTransparent ? "transparent" : saved.bg);
    });
    const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
    if (canvas) canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    engine.snapshotNow();
    engine.setFg(saved.fg);
    engine.setBg(saved.bg);
  }

  function handleDiscard() {
    setRestoreSession(null);
    rotateSession();
  }

  // ─── New document ─────────────────────────────────────────────────────────

  function handleNewDoc(width: number, height: number, bg: string) {
    engine.newDocument(width, height, bg);
    setNewDocOpen(false);
    rotateSession();
    engine.fitViewport?.();
  }

  const { width, height } = state.doc;
  const isTransparent = state.doc.bgWasTransparent;

  // A viewport gesture (Space-hold, or an in-flight pan drag) overrides the
  // tool cursor; otherwise the active tool decides.
  const canvasCursor =
    viewport.panCursor ??
    (state.tool === "pan" ? "grab" : state.tool === "text" ? "text" : "crosshair");

  return (
    <section className="paint-app">
      {restoreSession && (
        <RestoreBanner onRestore={handleRestore} onDiscard={handleDiscard} />
      )}
      <Toolbar
        engine={engine}
        state={state}
        onHelpOpen={() => setHelpOpen(true)}
        onNewDoc={() => setNewDocOpen(true)}
        onOpenFile={() => fileInputRef.current?.click()}
        onExport={() => setExportOpen(true)}
        onClearData={async () => { await clearAllAutosaveData(); rotateSession(); }}
        onResize={() => setResizeOpen(true)}
        onScale={() => setScaleOpen(true)}
        onSave={wsFileName ? () => void saveToWorkspaceFile() : undefined}
      />
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={false}
        style={{ display: "none" }}
        onChange={onFileInput}
      />
      {/* Scrollable / zoomable canvas area */}
      <div
        ref={outerRef}
        className="paint-canvas-outer"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div
          ref={viewport.wrapRef}
          id="paint-canvas-wrap"
          className={`paint-canvas-wrap${isTransparent ? " paint-canvas-wrap--checker" : ""}`}
          style={{ width: width, height: height, transformOrigin: "0 0" }}
        >
          <canvas
            ref={mainRef}
            width={width}
            height={height}
            className="paint-canvas paint-canvas-main"
          />
          <canvas
            ref={previewRef}
            width={width}
            height={height}
            className="paint-canvas paint-canvas-preview"
            style={{ cursor: canvasCursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          {state.textOverlay && (
            <TextOverlay engine={engine} state={state} canvasScale={canvasScale} />
          )}
        </div>
        <CanvasScrollbars
          outerRef={outerRef}
          docWidth={width}
          docHeight={height}
          zoom={state.zoom}
          panX={state.panX}
          panY={state.panY}
          setPan={viewport.setPan}
        />
      </div>
      <StatusBar state={state} />

      {/* Modals */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {newDocOpen && <NewDocDialog onConfirm={handleNewDoc} onClose={() => setNewDocOpen(false)} />}
      {exportOpen && (() => {
        const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
        return canvas ? <ExportDialog canvas={canvas} onClose={() => setExportOpen(false)} /> : null;
      })()}
      {pendingBitmap && (
        <ImportDialog
          bitmap={pendingBitmap}
          onConfirm={(mode) => applyImport(pendingBitmap, mode)}
          onClose={() => setPendingBitmap(null)}
        />
      )}
      {resizeOpen && (
        <CanvasSizeDialog
          mode="resize"
          engine={engine}
          state={state}
          onClose={() => setResizeOpen(false)}
        />
      )}
      {scaleOpen && (
        <CanvasSizeDialog
          mode="scale"
          engine={engine}
          state={state}
          onClose={() => setScaleOpen(false)}
        />
      )}
    </section>
  );
}
