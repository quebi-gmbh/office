/**
 * Horizontal + vertical rulers with px tick marks that track the current
 * pan/zoom. Rendered as two thin SVG strips along the top and left edges; the
 * `size` prop is the pixel extent of the ruler strip (top-left corner square).
 */
import type { Viewport } from "~/vector/lib/types";

const THICKNESS = 20;

/** Choose a "nice" tick spacing (in document px) for the current zoom. */
function tickStep(zoom: number): number {
  const target = 70 / zoom; // aim for ~70 screen px between labels
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const candidates = [1, 2, 5, 10].map((c) => c * pow);
  return candidates.find((c) => c >= target) ?? candidates[candidates.length - 1];
}

export function Rulers({ view, width, height }: { view: Viewport; width: number; height: number }) {
  const step = tickStep(view.zoom);
  const startX = Math.floor((-view.panX / view.zoom) / step) * step;
  const endX = (width - view.panX) / view.zoom;
  const startY = Math.floor((-view.panY / view.zoom) / step) * step;
  const endY = (height - view.panY) / view.zoom;

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
      {/* horizontal */}
      <svg
        className="absolute top-0 z-10 border-b border-border bg-card"
        style={{ left: THICKNESS, height: THICKNESS, width: `calc(100% - ${THICKNESS}px)` }}
      >
        {hTicks}
      </svg>
      {/* vertical */}
      <svg
        className="absolute left-0 z-10 border-r border-border bg-card"
        style={{ top: THICKNESS, width: THICKNESS, height: `calc(100% - ${THICKNESS}px)` }}
      >
        {vTicks}
      </svg>
    </>
  );
}

export const RULER_THICKNESS = THICKNESS;
