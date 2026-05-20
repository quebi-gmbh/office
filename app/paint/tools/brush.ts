/**
 * Brush tool — smooth strokes via perfect-freehand.
 *
 * perfect-freehand returns a polygon (array of [x,y] points) for the stroke outline.
 * We render it via Path2D + fill() on the preview canvas on every pointermove.
 * On pointerup, commitPreview() composites preview→main and snapshots history.
 *
 * Pressure: when pointerType === 'pen' we use actual pressure; otherwise we simulate it.
 */
import { getStroke } from "perfect-freehand";
import type { Tool, PaintContext, BrushOptions } from "~/paint/lib/types";

type Point = [number, number, number]; // [x, y, pressure]

interface BrushScratch {
  points?: Point[];
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  fg: string,
  size: number,
  opts: BrushOptions,
  simulatePressure: boolean,
): void {
  if (points.length === 0) return;

  const outline = getStroke(points, {
    size,
    smoothing: opts.smoothing,
    streamline: opts.streamline,
    thinning: opts.thinning,
    start: { taper: opts.taperStart },
    end: { taper: opts.taperEnd },
    simulatePressure,
  });

  if (outline.length < 2) return;

  const path = new Path2D();
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    path.lineTo(outline[i][0], outline[i][1]);
  }
  path.closePath();

  ctx.save();
  ctx.fillStyle = fg;
  ctx.fill(path);
  ctx.restore();
}

function addPoint(e: PointerEvent, ctx: PaintContext): Point {
  const p = ctx.toDocCoords(e.clientX, e.clientY);
  const pressure = e.pointerType === "pen" ? (e.pressure || 0.5) : 0.5;
  return [p.x, p.y, pressure];
}

export const brush: Tool = {
  id: "brush",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const scratch = ctx.scratch as unknown as BrushScratch;
    scratch.points = [addPoint(e, ctx)];
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as BrushScratch;
    if (!scratch.points) return;
    scratch.points.push(addPoint(e, ctx));

    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawStroke(
      ctx.preview,
      scratch.points,
      ctx.fg,
      ctx.size,
      ctx.brush,
      e.pointerType !== "pen",
    );
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as BrushScratch;
    if (!scratch.points || scratch.points.length === 0) return;

    scratch.points.push(addPoint(e, ctx));
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawStroke(
      ctx.preview,
      scratch.points,
      ctx.fg,
      ctx.size,
      ctx.brush,
      e.pointerType !== "pen",
    );

    ctx.commitPreview();
    scratch.points = [];
  },

  onCancel(ctx) {
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    const scratch = ctx.scratch as unknown as BrushScratch;
    scratch.points = [];
  },
};
