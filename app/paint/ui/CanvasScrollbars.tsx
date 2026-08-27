/**
 * Overlay scrollbars for the paint canvas viewport.
 *
 * The viewport is a CSS transform on `.paint-canvas-wrap`, so the outer element
 * has no native scrollable overflow to hang real scrollbars off. These thumbs
 * are derived from (panX, panY, zoom) instead — see `lib/scrollbars.ts` for the
 * geometry — which keeps them in sync with every pan/zoom path for free: wheel,
 * pinch, Space-drag, the hand tool, Ctrl+0 (fit) and Ctrl+1 (100 %) all funnel
 * through the same transform.
 *
 * A bar is rendered only while its axis actually overflows.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  axisScroll,
  panForThumbDrag,
  panForTrackClick,
  type AxisScroll,
} from "~/paint/lib/scrollbars";

/** Track thickness in px (the thumb is inset within it). */
const BAR = 12;
/** Inset of the thumb inside its track, per side. */
const PAD = 3;

interface CanvasScrollbarsProps {
  /** The clipping pane the canvas is drawn into; must be `position: relative`. */
  outerRef: React.RefObject<HTMLDivElement | null>;
  docWidth: number;
  docHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  /** Apply an absolute pan (both axes) to the viewport. */
  setPan(panX: number, panY: number): void;
}

/** State frozen for the duration of one thumb drag. */
interface ThumbDrag {
  axis: "x" | "y";
  startClient: number;
  pan0: number;
  otherPan: number;
  snapshot: AxisScroll;
}

export function CanvasScrollbars({
  outerRef,
  docWidth,
  docHeight,
  zoom,
  panX,
  panY,
  setPan,
}: CanvasScrollbarsProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<ThumbDrag | null>(null);

  // Latest pan, readable from window event handlers without re-binding them.
  const panRef = useRef({ panX, panY });
  panRef.current = { panX, panY };

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    setSize({ w: outer.clientWidth, h: outer.clientHeight });
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(outer);
    return () => observer.disconnect();
  }, [outerRef]);

  // Two passes: whether an axis overflows depends only on the pane size, but the
  // track is shortened when the *other* bar is present, so resolve overflow
  // first and then measure the tracks.
  const contentW = docWidth * zoom;
  const contentH = docHeight * zoom;
  const xOverflow = axisScroll(panX, contentW, size.w).overflow;
  const yOverflow = axisScroll(panY, contentH, size.h).overflow;
  const x = axisScroll(panX, contentW, size.w, size.w - (yOverflow ? BAR : 0));
  const y = axisScroll(panY, contentH, size.h, size.h - (xOverflow ? BAR : 0));

  const onThumbMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (drag.axis === "x" ? e.clientX : e.clientY) - drag.startClient;
      const next = panForThumbDrag(drag.snapshot, drag.pan0, delta);
      if (drag.axis === "x") setPan(next, drag.otherPan);
      else setPan(drag.otherPan, next);
    },
    [setPan],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onThumbMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onThumbMove]);

  // Never leave window listeners behind if the bar unmounts mid-drag (e.g. the
  // user hits Ctrl+0 while holding a thumb).
  useEffect(() => endDrag, [endDrag]);

  function startThumbDrag(e: React.PointerEvent, axis: "x" | "y", snapshot: AxisScroll) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      axis,
      startClient: axis === "x" ? e.clientX : e.clientY,
      pan0: axis === "x" ? panRef.current.panX : panRef.current.panY,
      otherPan: axis === "x" ? panRef.current.panY : panRef.current.panX,
      snapshot,
    };
    window.addEventListener("pointermove", onThumbMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function onTrackDown(
    e: React.PointerEvent<HTMLDivElement>,
    axis: "x" | "y",
    snapshot: AxisScroll,
  ) {
    // Only the track itself — the thumb stops propagation before this runs.
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = axis === "x" ? e.clientX - rect.left : e.clientY - rect.top;
    const { panX: px, panY: py } = panRef.current;
    const next = panForTrackClick(snapshot, axis === "x" ? px : py, pos);
    if (axis === "x") setPan(next, py);
    else setPan(px, next);
  }

  if (!x.overflow && !y.overflow) return null;

  const trackClass = "absolute z-20 touch-none bg-fg/5 transition-colors hover:bg-fg/10";
  const thumbClass =
    "absolute cursor-grab rounded-full bg-fg/30 transition-colors hover:bg-fg/50 active:cursor-grabbing active:bg-fg/60";

  return (
    <>
      {x.overflow && (
        <div
          role="scrollbar"
          aria-controls="paint-canvas-wrap"
          aria-orientation="horizontal"
          aria-label="Scroll canvas horizontally"
          aria-valuemin={0}
          aria-valuemax={Math.round(x.maxScroll)}
          aria-valuenow={Math.round(x.scroll)}
          className={trackClass}
          style={{ left: 0, bottom: 0, height: BAR, right: y.overflow ? BAR : 0 }}
          onPointerDown={(e) => onTrackDown(e, "x", x)}
        >
          <div
            className={thumbClass}
            style={{ left: x.thumbOffset, width: x.thumb, top: PAD, height: BAR - PAD * 2 }}
            onPointerDown={(e) => startThumbDrag(e, "x", x)}
          />
        </div>
      )}

      {y.overflow && (
        <div
          role="scrollbar"
          aria-controls="paint-canvas-wrap"
          aria-orientation="vertical"
          aria-label="Scroll canvas vertically"
          aria-valuemin={0}
          aria-valuemax={Math.round(y.maxScroll)}
          aria-valuenow={Math.round(y.scroll)}
          className={trackClass}
          style={{ top: 0, right: 0, width: BAR, bottom: x.overflow ? BAR : 0 }}
          onPointerDown={(e) => onTrackDown(e, "y", y)}
        >
          <div
            className={thumbClass}
            style={{ top: y.thumbOffset, height: y.thumb, left: PAD, width: BAR - PAD * 2 }}
            onPointerDown={(e) => startThumbDrag(e, "y", y)}
          />
        </div>
      )}

      {x.overflow && y.overflow && (
        <div
          aria-hidden
          className="absolute z-20 bg-fg/5"
          style={{ right: 0, bottom: 0, width: BAR, height: BAR }}
        />
      )}
    </>
  );
}
