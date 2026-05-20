/**
 * Root composition component for the paint tool.
 * Mounts both canvases, wires the engine, renders the toolbar.
 * This component owns no drawing logic — it's all in the engine and tools.
 */
import { useCallback } from "react";
import { usePaintEngine } from "~/paint/hooks/usePaintEngine";
import { Toolbar } from "~/paint/ui/Toolbar";

export function PaintApp() {
  const { engine, state, mainRef, previewRef } = usePaintEngine();

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
      // Only cancel if no button is held (no active drag).
      if (e.buttons === 0) return;
      // Pointer-capture keeps events coming even outside the element, so
      // we only reach here if capture was not acquired (shouldn't happen).
      engine.cancelDrag();
    },
    [engine],
  );

  const { width, height } = state.doc;
  const isTransparent = state.doc.bgWasTransparent;

  return (
    <section className="paint-app">
      <Toolbar engine={engine} state={state} />
      <div
        className={`paint-canvas-wrap${isTransparent ? " paint-canvas-wrap--checker" : ""}`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* main canvas — committed pixels */}
        <canvas
          ref={mainRef}
          width={width}
          height={height}
          className="paint-canvas paint-canvas-main"
        />
        {/* preview canvas — in-progress strokes and shape rubber-bands */}
        <canvas
          ref={previewRef}
          width={width}
          height={height}
          className="paint-canvas paint-canvas-preview"
          style={{ cursor: TOOL_CURSORS[state.tool] ?? "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
      </div>
      {/* Status bar — expanded in #29; minimal here */}
      <footer className="paint-statusbar">
        <span>{state.tool}</span>
        {state.cursorDoc && (
          <span>
            x: {Math.round(state.cursorDoc.x)} y: {Math.round(state.cursorDoc.y)}
          </span>
        )}
        <span>{width} × {height}</span>
      </footer>
    </section>
  );
}

const TOOL_CURSORS: Record<string, string> = {
  text: "text",
  eyedropper: "crosshair",
};
