/**
 * Viewport hook — wheel zoom, space-drag pan, two-finger pinch (pointer events).
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
 * Pan:
 *   Hold Space → grab cursor; drag pans.
 *   Two-finger touch drag (both pointers) — centroid translation.
 *   Ctrl+0 → fit to wrapper; Ctrl+1 → 100 %.
 *
 * Pinch cancels the active tool (calls engine.cancelDrag()).
 */
import { useEffect, useRef, useCallback, useMemo } from "react";
import type { Engine } from "~/paint/engine";

interface Transform {
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
}

export function useViewport(engine: Engine): UseViewportResult {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Current transform stored in a ref — written by event handlers, applied as CSS.
  const transformRef = useRef<Transform>({ panX: 0, panY: 0, zoom: 1 });

  // Space-bar state.
  const spaceRef = useRef(false);
  const spaceDragRef = useRef<{ x: number; y: number } | null>(null);

  // Two-finger pointer IDs and their last positions.
  const fingersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  function applyTransform(t: Transform) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    transformRef.current = t;
    wrap.style.transform = `translate(${t.panX}px, ${t.panY}px) scale(${t.zoom})`;
    // Update engine state so status-bar zoom % is correct.
    engine.store.setState((s) => ({ ...s, zoom: t.zoom, panX: t.panX, panY: t.panY }));
  }

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
        wrap!.style.cursor = "grab";
        e.preventDefault();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceRef.current = false;
        spaceDragRef.current = null;
        wrap!.style.cursor = "";
      }
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
      if (spaceRef.current) {
        spaceDragRef.current = { x: e.clientX, y: e.clientY };
      }
    }

    function onPointerMove(e: PointerEvent) {
      const fingers = fingersRef.current;

      // Space-drag pan.
      if (spaceRef.current && spaceDragRef.current) {
        const dx = e.clientX - spaceDragRef.current.x;
        const dy = e.clientY - spaceDragRef.current.y;
        spaceDragRef.current = { x: e.clientX, y: e.clientY };
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
      if (spaceRef.current) spaceDragRef.current = null;
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    // Listen on window so we get moves anywhere.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    wrap.addEventListener("pointerdown", onPointerDown);

    return () => {
      wrap.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      wrap.removeEventListener("pointerdown", onPointerDown);
    };
  }, [engine, fit]);

  // Ctrl+0 / Ctrl+1 wired via the shortcuts registry in #28.
  // Expose fit/oneToOne for the toolbar and shortcuts to call.
  // We need to patch the engine to support viewport shortcuts.

  // Stable object — only recreated when fit/oneToOne callbacks change (i.e. when
  // engine changes), NOT on every render.  Without useMemo the returned object
  // is a new reference each render, making effects that depend on it loop.
  return useMemo(
    () => ({
      wrapRef,
      cssTransform: (t: Transform) => `translate(${t.panX}px, ${t.panY}px) scale(${t.zoom})`,
      fit,
      oneToOne,
    }),
    [fit, oneToOne],
  );
}
