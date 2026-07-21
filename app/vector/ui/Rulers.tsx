/**
 * Horizontal + vertical rulers with px tick marks that track the current
 * pan/zoom. Rendered as two thin SVG strips along the top and left edges; the
 * `size` prop is the pixel extent of the ruler strip (top-left corner square).
 *
 * Dragging out of a ruler creates a guide (top ruler → horizontal guide, left
 * ruler → vertical guide); the drag is captured on the ruler and forwarded to
 * the engine.
 */
import { useRef } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import type { VectorEngine } from "~/vector/lib/engine";
import type { ViewportApi } from "~/vector/hooks/useViewport";
import { newId } from "~/vector/lib/id";
import type { Guide, Viewport } from "~/vector/lib/types";

const THICKNESS = 20;

/** Choose a "nice" tick spacing (in document px) for the current zoom. */
function tickStep(zoom: number): number {
  const target = 70 / zoom; // aim for ~70 screen px between labels
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const candidates = [1, 2, 5, 10].map((c) => c * pow);
  return candidates.find((c) => c >= target) ?? candidates[candidates.length - 1];
}

interface Props {
  engine: VectorEngine;
  viewport: ViewportApi;
  view: Viewport;
  guides: Guide[];
  width: number;
  height: number;
}

export function Rulers({ engine, viewport, view, width, height }: Props) {
  const dragRef = useRef<{ id: string; axis: "x" | "y" } | null>(null);
  const step = tickStep(view.zoom);
  const startX = Math.floor((-view.panX / view.zoom) / step) * step;
  const endX = (width - view.panX) / view.zoom;
  const startY = Math.floor((-view.panY / view.zoom) / step) * step;
  const endY = (height - view.panY) / view.zoom;

  const startGuide = (axis: "x" | "y") => (e: RPointerEvent) => {
    const world = viewport.screenToDoc(e.clientX, e.clientY);
    const id = newId();
    engine.addGuide({ id, axis, pos: axis === "x" ? world[0] : world[1] });
    dragRef.current = { id, axis };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const moveGuide = (e: RPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const world = viewport.screenToDoc(e.clientX, e.clientY);
    engine.updateGuide(d.id, d.axis === "x" ? world[0] : world[1]);
  };
  const endGuide = () => {
    if (dragRef.current) engine.commit();
    dragRef.current = null;
  };

  // Ruler SVGs start at (THICKNESS, THICKNESS); pan/zoom are in container
  // coords, so subtract THICKNESS to align ticks with the canvas underneath.
  const hTicks: React.ReactNode[] = [];
  for (let x = startX; x <= endX; x += step) {
    const sx = x * view.zoom + view.panX - THICKNESS;
    hTicks.push(<line key={`h${x}`} x1={sx} y1={THICKNESS - 6} x2={sx} y2={THICKNESS} stroke="#475569" strokeWidth={1} />);
    hTicks.push(
      <text key={`ht${x}`} x={sx + 2} y={THICKNESS - 8} fill="#64748b" fontSize={9} fontFamily="monospace">
        {Math.round(x)}
      </text>,
    );
  }
  const vTicks: React.ReactNode[] = [];
  for (let y = startY; y <= endY; y += step) {
    const sy = y * view.zoom + view.panY - THICKNESS;
    vTicks.push(<line key={`v${y}`} x1={THICKNESS - 6} y1={sy} x2={THICKNESS} y2={sy} stroke="#475569" strokeWidth={1} />);
    vTicks.push(
      <text
        key={`vt${y}`}
        x={THICKNESS - 8}
        y={sy - 2}
        fill="#64748b"
        fontSize={9}
        fontFamily="monospace"
        transform={`rotate(-90 ${THICKNESS - 8} ${sy - 2})`}
      >
        {Math.round(y)}
      </text>,
    );
  }

  return (
    <>
      {/* corner */}
      <div
        className="absolute left-0 top-0 z-10 border-b border-r border-border bg-card"
        style={{ width: THICKNESS, height: THICKNESS }}
      />
      {/* horizontal — drag down to place a horizontal guide */}
      <svg
        className="absolute top-0 z-10 border-b border-border bg-card"
        style={{ left: THICKNESS, height: THICKNESS, width: `calc(100% - ${THICKNESS}px)`, cursor: "ns-resize", touchAction: "none" }}
        onPointerDown={startGuide("y")}
        onPointerMove={moveGuide}
        onPointerUp={endGuide}
      >
        {hTicks}
      </svg>
      {/* vertical — drag right to place a vertical guide */}
      <svg
        className="absolute left-0 z-10 border-r border-border bg-card"
        style={{ top: THICKNESS, width: THICKNESS, height: `calc(100% - ${THICKNESS}px)`, cursor: "ew-resize", touchAction: "none" }}
        onPointerDown={startGuide("x")}
        onPointerMove={moveGuide}
        onPointerUp={endGuide}
      >
        {vTicks}
      </svg>
    </>
  );
}

export const RULER_THICKNESS = THICKNESS;
