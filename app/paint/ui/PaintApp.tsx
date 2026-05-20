/**
 * Root composition component for the paint tool.
 * Mounts both canvases, wires the engine and viewport, renders toolbar and overlays.
 * This component owns no drawing logic — it's all in the engine and tools.
 */
import { useCallback, useRef, useState, useEffect } from "react";
import { usePaintEngine } from "~/paint/hooks/usePaintEngine";
import { useShortcuts } from "~/paint/hooks/useShortcuts";
import { useViewport } from "~/paint/hooks/useViewport";
import { Toolbar } from "~/paint/ui/Toolbar";
import { StatusBar } from "~/paint/ui/StatusBar";
import { TextOverlay } from "~/paint/ui/TextOverlay";
import { HelpModal } from "~/paint/ui/HelpModal";
import { NewDocDialog } from "~/paint/ui/NewDocDialog";

export function PaintApp() {
  const { engine, state, mainRef, previewRef } = usePaintEngine();
  const { helpOpen, setHelpOpen } = useShortcuts(engine);
  const [newDocOpen, setNewDocOpen] = useState(false);

  const viewport = useViewport(engine);
  const [canvasScale, setCanvasScale] = useState(1);

  // Wire viewport fit/resetZoom into engine so shortcuts can call them.
  useEffect(() => {
    engine.fitViewport = () => {
      const t = viewport.fit();
      const wrap = viewport.wrapRef.current;
      if (wrap) {
        wrap.style.transform = viewport.cssTransform(t);
        engine.store.setState((s) => ({ ...s, zoom: t.zoom, panX: t.panX, panY: t.panY }));
      }
    };
    engine.resetZoom = () => {
      const t = viewport.oneToOne();
      const wrap = viewport.wrapRef.current;
      if (wrap) {
        wrap.style.transform = viewport.cssTransform(t);
        engine.store.setState((s) => ({ ...s, zoom: 1, panX: 0, panY: 0 }));
      }
    };
  }, [engine, viewport]);

  // Track CSS scale for text overlay positioning.
  useEffect(() => {
    const wrap = viewport.wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasScale(entry.contentRect.width / state.doc.width);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [state.doc.width, viewport.wrapRef]);

  // Forward pointer events to the engine.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      engine.onPointerDown(e.nativeEvent);
    },
    [engine],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      engine.onPointerMove(e.nativeEvent);
    },
    [engine],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      engine.onPointerUp(e.nativeEvent);
    },
    [engine],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons === 0) return;
      engine.cancelDrag();
    },
    [engine],
  );

  function handleNewDoc(width: number, height: number, bg: string) {
    engine.newDocument(width, height, bg);
    setNewDocOpen(false);
    // Reset viewport after new doc so canvas is visible.
    engine.fitViewport?.();
  }

  const { width, height } = state.doc;
  const isTransparent = state.doc.bgWasTransparent;

  return (
    <section className="paint-app">
      <Toolbar
        engine={engine}
        state={state}
        onHelpOpen={() => setHelpOpen(true)}
        onNewDoc={() => setNewDocOpen(true)}
      />
      {/* Scrollable / zoomable container */}
      <div className="paint-canvas-outer">
        <div
          ref={viewport.wrapRef}
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
            style={{ cursor: state.tool === "text" ? "text" : "crosshair" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          {state.textOverlay && (
            <TextOverlay engine={engine} state={state} canvasScale={canvasScale} />
          )}
        </div>
      </div>
      <StatusBar state={state} />
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {newDocOpen && <NewDocDialog onConfirm={handleNewDoc} onClose={() => setNewDocOpen(false)} />}
    </section>
  );
}
