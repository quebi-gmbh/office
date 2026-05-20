/**
 * React glue for the paint engine.
 *
 * - Creates the engine once (stable ref across renders).
 * - Mounts it when both canvas refs are available.
 * - Exposes the engine instance and a live snapshot of EngineState.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createEngine } from "~/paint/engine";
import type { Engine } from "~/paint/engine";
import type { EngineState } from "~/paint/lib/types";

export interface PaintEngineHandle {
  engine: Engine;
  state: EngineState;
  /** Attach to the main <canvas> ref. */
  mainRef: React.RefCallback<HTMLCanvasElement>;
  /** Attach to the preview <canvas> ref. */
  previewRef: React.RefCallback<HTMLCanvasElement>;
}

export function usePaintEngine(): PaintEngineHandle {
  // Stable engine instance — never recreated.
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createEngine();
  }
  const engine = engineRef.current;

  // Canvas refs — we need both before we can mount.
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(false);

  const tryMount = useCallback(() => {
    if (mountedRef.current) return;
    if (!mainCanvasRef.current || !previewCanvasRef.current) return;
    mountedRef.current = true;
    engine.mount(mainCanvasRef.current, previewCanvasRef.current);
  }, [engine]);

  const mainRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      mainCanvasRef.current = el;
      if (el) tryMount();
    },
    [tryMount],
  );

  const previewRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      previewCanvasRef.current = el;
      if (el) tryMount();
    },
    [tryMount],
  );

  // Dispose engine on unmount.
  useEffect(() => {
    return () => {
      engine.dispose();
    };
  }, [engine]);

  // Subscribe to engine state changes.
  const state = useSyncExternalStore(
    engine.store.subscribe,
    engine.store.getSnapshot,
    engine.store.getSnapshot,
  );

  return { engine, state, mainRef, previewRef };
}
