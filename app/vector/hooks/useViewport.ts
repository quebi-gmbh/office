import { useCallback } from "react";
import type { RefObject } from "react";
import { selectionBounds, type VectorEngine } from "~/vector/lib/engine";
import type { Point } from "~/vector/lib/types";

/**
 * View transform helpers around the engine's `view` (zoom + pan). The document
 * is rendered inside an SVG that fills `containerRef`; a document point (dx,dy)
 * maps to a container-local screen point (dx*zoom + panX, dy*zoom + panY).
 */
export function useViewport(engine: VectorEngine, containerRef: RefObject<HTMLElement | null>) {
  const size = useCallback((): { w: number; h: number } => {
    const el = containerRef.current;
    if (!el) return { w: 800, h: 600 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, [containerRef]);

  /** Map a client (mouse) coordinate to document space. */
  const screenToDoc = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = containerRef.current;
      const view = engine.store.getSnapshot().view;
      const rect = el?.getBoundingClientRect();
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      return [(sx - view.panX) / view.zoom, (sy - view.panY) / view.zoom];
    },
    [containerRef, engine],
  );

  const fit = useCallback(() => {
    const { w, h } = size();
    const { doc } = engine.store.getSnapshot();
    const zoom = Math.min(w / doc.width, h / doc.height) * 0.9;
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    engine.setView({
      zoom: z,
      panX: (w - doc.width * z) / 2,
      panY: (h - doc.height * z) / 2,
    });
  }, [engine, size]);

  const resetZoom = useCallback(() => {
    const { w, h } = size();
    const { doc } = engine.store.getSnapshot();
    engine.setView({ zoom: 1, panX: (w - doc.width) / 2, panY: (h - doc.height) / 2 });
  }, [engine, size]);

  const zoomToSelection = useCallback(() => {
    const state = engine.store.getSnapshot();
    const b = selectionBounds(state);
    if (!b) {
      fit();
      return;
    }
    const { w, h } = size();
    const bw = Math.max(b.maxX - b.minX, 1);
    const bh = Math.max(b.maxY - b.minY, 1);
    const zoom = Math.min(w / bw, h / bh) * 0.8;
    const z = Number.isFinite(zoom) && zoom > 0 ? Math.min(zoom, 8) : 1;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    engine.setView({ zoom: z, panX: w / 2 - cx * z, panY: h / 2 - cy * z });
  }, [engine, fit, size]);

  /** Zoom by `factor` keeping the given client point stationary. */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const el = containerRef.current;
      const rect = el?.getBoundingClientRect();
      const view = engine.store.getSnapshot().view;
      const sx = clientX - (rect?.left ?? 0);
      const sy = clientY - (rect?.top ?? 0);
      const nextZoom = Math.max(0.05, Math.min(32, view.zoom * factor));
      const k = nextZoom / view.zoom;
      engine.setView({
        zoom: nextZoom,
        panX: sx - (sx - view.panX) * k,
        panY: sy - (sy - view.panY) * k,
      });
    },
    [containerRef, engine],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const view = engine.store.getSnapshot().view;
      engine.setView({ panX: view.panX + dx, panY: view.panY + dy });
    },
    [engine],
  );

  return { screenToDoc, fit, resetZoom, zoomToSelection, zoomAt, panBy };
}

export type ViewportApi = ReturnType<typeof useViewport>;
