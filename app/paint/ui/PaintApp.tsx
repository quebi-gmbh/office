/**
 * Root composition component for the paint tool.
 * Mounts both canvases, wires the engine, renders the toolbar and overlays.
 * This component owns no drawing logic — it's all in the engine and tools.
 */
import { useCallback, useRef, useState, useEffect } from "react";
import { usePaintEngine } from "~/paint/hooks/usePaintEngine";
import { useShortcuts } from "~/paint/hooks/useShortcuts";
import { Toolbar } from "~/paint/ui/Toolbar";
import { TextOverlay } from "~/paint/ui/TextOverlay";
import { HelpModal } from "~/paint/ui/HelpModal";

export function PaintApp() {
  const { engine, state, mainRef, previewRef } = usePaintEngine();
  const { helpOpen, setHelpOpen } = useShortcuts(engine);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Track the CSS scale factor (display width / doc width) for overlay positioning.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasScale(entry.contentRect.width / state.doc.width);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [state.doc.width]);

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

  const { width, height } = state.doc;
  const isTransparent = state.doc.bgWasTransparent;

  return (
    <section className="paint-app">
      <Toolbar engine={engine} state={state} onHelpOpen={() => setHelpOpen(true)} />
      <div
        ref={wrapRef}
        className={`paint-canvas-wrap${isTransparent ? " paint-canvas-wrap--checker" : ""}`}
        style={{ aspectRatio: `${width} / ${height}` }}
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
      <footer className="paint-statusbar">
        <span>{state.tool}</span>
        {state.cursorDoc && (
          <span>
            x: {Math.round(state.cursorDoc.x)}&nbsp; y: {Math.round(state.cursorDoc.y)}
          </span>
        )}
        <span>{width} × {height}</span>
      </footer>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </section>
  );
}
