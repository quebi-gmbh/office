/**
 * Viewport hook — wheel zoom, drag pan, two-finger pinch (pointer events).
 *
 * The viewport transform is applied as a CSS transform on the canvas wrapper:
 *   translate(panX px, panY px) scale(zoom)
 *
 * We use CSS transform (not canvas transform) so we don't need to retransform
 * all drawing calls — tools work in doc space; the engine's toDocCoords uses
 * getBoundingClientRect() on the preview canvas, which already accounts for the
 * CSS transform.
 *
 * Zoom:
 *   Wheel without Ctrl — scroll (vertical pan).
 *   Wheel + Ctrl, or pinch (macOS sends wheel+ctrlKey for trackpad pinch).
 *   scale' = clamp(scale * exp(-dy * k), 0.05, 32)
 *   Pan is adjusted so the document point under the cursor stays put.
 *
 * Pan — one drag implementation, three ways in:
 *   Hold Space (temporary override of whatever tool is active).
 *   The "pan" (hand) tool, which is armed for as long as it is selected.
 *   The scrollbar thumbs, via the exposed setPan().
 *   Plus: two-finger touch drag (centroid translation) and wheel scroll.
 *   Ctrl+0 → fit to wrapper; Ctrl+1 → 100 %.
 *
 * Pinch cancels the active tool (calls engine.cancelDrag()).
 */
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import type { Engine } from "~/paint/engine";

export interface Transform {
  panX: number;
  panY: number;
  zoom: number;
}

interface UseViewportResult {
  /** Attach to the canvas wrapper element. */
  wrapRef: React.RefObject<HTMLDivElement | null>;
  /** Apply to the wrapper's style.transform. */
  cssTransform(t: Transform): string;
  /** Compute fit transform (call to reset to Ctrl+0). */
  fit(): Transform;
  /** 100% transform. */
  oneToOne(): Transform;
  /**
   * Cursor the canvas should show because of a *viewport* gesture, or null when
   * the viewport has no opinion and the active tool's cursor should win.
   * "grabbing" while a pan drag is in flight, "grab" while Space is held.
   */
  panCursor: "grab" | "grabbing" | null;
  /** Set the pan absolutely, keeping the current zoom. Used by the scrollbars. */
  setPan(panX: number, panY: number): void;
  /** Apply a full transform (CSS + engine state). Used for fit / 100 %. */
  apply(t: Transform): void;
  /**
   * True when a pointer drag on the canvas would pan rather than draw — the pan
   * tool is selected, or Space is held. Read at pointerdown so the canvas can
   * withhold the event from the engine entirely.
   */
  isPanGesture(): boolean;
}

/** Last screen position seen during a drag-pan, in client coordinates. */
interface DragOrigin {
  x: number;
  y: number;
}

export function useViewport(engine: Engine): UseViewportResult {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Current transform stored in a ref — written by event handlers, applied as CSS.
  const transformRef = useRef<Transform>({ panX: 0, panY: 0, zoom: 1 });

  // Space-bar state.
  const spaceRef = useRef(false);
  // Active drag-pan origin (Space-hold *or* the pan tool), null when not dragging.
  const panDragRef = useRef<DragOrigin | null>(null);

  // Two-finger pointer IDs and their last positions.
  const fingersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Mirrored into React state so the canvas cursor can react to it.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

  const applyTransform = useCallback(
    (t: Transform) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      transformRef.current = t;
      wrap.style.transform = `translate(${t.panX}px, ${t.panY}px) scale(${t.zoom})`;
      // Update engine state so the status-bar zoom % and the scrollbars are correct.
      engine.store.setState((s) =>
        s.zoom === t.zoom && s.panX === t.panX && s.panY === t.panY
          ? s
          : { ...s, zoom: t.zoom, panX: t.panX, panY: t.panY },
      );
    },
    [engine],
  );

  const setPan = useCallback(
    (panX: number, panY: number) => {
      applyTransform({ ...transformRef.current, panX, panY });
    },
    [applyTransform],
  );

  function getWrapSize(): { w: number; h: number } {
    const wrap = wrapRef.current;
    if (!wrap) return { w: 800, h: 600 };
    const parent = wrap.parentElement;
    if (!parent) return { w: wrap.offsetWidth, h: wrap.offsetHeight };
    return { w: parent.offsetWidth, h: parent.offsetHeight };
  }

  const fit = useCallback((): Transform => {
    const state = engine.store.getSnapshot();
    const { w, h } = getWrapSize();
    const margin = 16;
    const zoom = Math.min(
      (w - margin * 2) / state.doc.width,
      (h - margin * 2) / state.doc.height,
    );
    const panX = (w - state.doc.width * zoom) / 2;
    const panY = (h - state.doc.height * zoom) / 2;
    return { panX, panY, zoom };
  }, [engine]);

  const oneToOne = useCallback((): Transform => {
    return { panX: 0, panY: 0, zoom: 1 };
  }, []);

  /** True when a pointer drag on the canvas should pan instead of draw. */
  const isPanGesture = useCallback(
    () => spaceRef.current || engine.store.getSnapshot().tool === "pan",
    [engine],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // ── Wheel ──────────────────────────────────────────────────────────────

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const t = transformRef.current;

      // macOS pinch gesture arrives as wheel + ctrlKey.
      const isPinch = e.ctrlKey;
      const isZoom = isPinch;

      if (isZoom) {
        // Zoom centred at cursor.
        //
        // getBoundingClientRect() returns visual coordinates that already
        // incorporate the CSS transform (translate + scale). So:
        //   rect.left = outerLeft + panX
        //   rect.top  = outerTop  + panY
        //
        // Doc-space point under cursor:
        //   docX = (clientX - rect.left) / zoom
        //
        // To keep that doc point fixed after zoom change:
        //   outerLeft + newPanX + docX * newZoom = clientX
        //   newPanX = clientX - (rect.left - panX) - docX * newZoom
        const rect = wrap!.getBoundingClientRect();
        const newZoom = Math.max(0.05, Math.min(32, t.zoom * Math.exp(-e.deltaY * 0.002)));

        const docX = (e.clientX - rect.left) / t.zoom;
        const docY = (e.clientY - rect.top)  / t.zoom;
        const nextPanX = e.clientX - (rect.left - t.panX) - docX * newZoom;
        const nextPanY = e.clientY - (rect.top  - t.panY) - docY * newZoom;

        applyTransform({ panX: nextPanX, panY: nextPanY, zoom: newZoom });
      } else {
        // Plain scroll — pan.
        const dx = e.shiftKey ? -e.deltaY : -e.deltaX;
        const dy = e.shiftKey ? 0 : -e.deltaY;
        applyTransform({ ...t, panX: t.panX + dx, panY: t.panY + dy });
      }
    }

    wrap.addEventListener("wheel", onWheel, { passive: false });

    // ── Space / pointer for pan ────────────────────────────────────────────

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        const editable = (e.target as HTMLElement)?.isContentEditable ||
          (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/);
        if (editable) return;
        spaceRef.current = true;
        setSpaceHeld(true);
        e.preventDefault();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
        // Only end the drag if it isn't also held open by the pan tool.
        if (!isPanGesture()) endPanDrag();
      }
    }

    function endPanDrag() {
      if (!panDragRef.current) return;
      panDragRef.current = null;
      setPanning(false);
    }

    // ── Two-finger pointer drag ────────────────────────────────────────────
    // We handle pointerdown/move/up on the wrapper (not the canvas) to intercept
    // multi-touch before the active tool sees it.

    function onPointerDown(e: PointerEvent) {
      if (e.target === wrap) return; // direct on wrapper; ignore (canvas handles pointer)
      fingersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingersRef.current.size === 2) {
        // Two-finger: cancel active tool drag.
        engine.cancelDrag();
      }
      if (isPanGesture()) {
        panDragRef.current = { x: e.clientX, y: e.clientY };
        setPanning(true);
      }
    }

    function onPointerMove(e: PointerEvent) {
      const fingers = fingersRef.current;

      // Drag pan — Space-hold or the pan tool, one code path.
      const origin = panDragRef.current;
      if (origin) {
        const dx = e.clientX - origin.x;
        const dy = e.clientY - origin.y;
        panDragRef.current = { x: e.clientX, y: e.clientY };
        const t = transformRef.current;
        applyTransform({ ...t, panX: t.panX + dx, panY: t.panY + dy });
        return;
      }

      if (fingers.size === 2 && fingers.has(e.pointerId)) {
        const prev = fingers.get(e.pointerId)!;
        const other = [...fingers.entries()].find(([id]) => id !== e.pointerId);

        if (other) {
          const [, otherPos] = other;
          const prevMid = {
            x: (prev.x + otherPos.x) / 2,
            y: (prev.y + otherPos.y) / 2,
          };
          const newMid = {
            x: (e.clientX + otherPos.x) / 2,
            y: (e.clientY + otherPos.y) / 2,
          };
          const prevDist = Math.hypot(prev.x - otherPos.x, prev.y - otherPos.y);
          const newDist = Math.hypot(e.clientX - otherPos.x, e.clientY - otherPos.y);

          if (prevDist > 0) {
            const t = transformRef.current;
            const scale = newDist / prevDist;
            const newZoom = Math.max(0.05, Math.min(32, t.zoom * scale));
            const panDx = newMid.x - prevMid.x;
            const panDy = newMid.y - prevMid.y;
            applyTransform({ panX: t.panX + panDx, panY: t.panY + panDy, zoom: newZoom });
          }
        }

        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    }

    function onPointerUp(e: PointerEvent) {
      fingersRef.current.delete(e.pointerId);
      endPanDrag();
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    // Listen on window so we get moves anywhere.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    wrap.addEventListener("pointerdown", onPointerDown);

    return () => {
      wrap.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      wrap.removeEventListener("pointerdown", onPointerDown);
    };
  }, [engine, applyTransform, isPanGesture]);

  const panCursor: "grab" | "grabbing" | null = panning
    ? "grabbing"
    : spaceHeld
      ? "grab"
      : null;

  // Stable object — only recreated when its members change (i.e. when engine
  // changes, or a pan gesture starts/stops), NOT on every render. Without
  // useMemo the returned object is a new reference each render, making effects
  // that depend on it loop.
  return useMemo(
    () => ({
      wrapRef,
      cssTransform: (t: Transform) => `translate(${t.panX}px, ${t.panY}px) scale(${t.zoom})`,
      fit,
      oneToOne,
      panCursor,
      setPan,
      apply: applyTransform,
      isPanGesture,
    }),
    [fit, oneToOne, panCursor, setPan, applyTransform, isPanGesture],
  );
}
