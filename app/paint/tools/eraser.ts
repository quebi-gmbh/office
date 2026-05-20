/**
 * Eraser tool — two modes:
 *
 * "bg" mode: paints with the background colour (opaque), essentially a brush
 *   filled with the BG colour. Works well for solid-background documents.
 *
 * "erase" mode: uses globalCompositeOperation = "destination-out" to punch
 *   alpha holes — makes pixels transparent. Useful on transparent-background docs.
 *
 * Both modes write directly to main (no preview canvas compositing) to avoid
 * alpha issues when compositing a partially-transparent stroke over existing
 * destination-out regions.
 */
import type { Tool, PaintContext } from "~/paint/lib/types";

interface EraserScratch {
  lastX: number;
  lastY: number;
}

function erase(
  mainCtx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  mode: "bg" | "erase",
  bg: string,
): void {
  mainCtx.save();

  if (mode === "erase") {
    mainCtx.globalCompositeOperation = "destination-out";
    mainCtx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    mainCtx.globalCompositeOperation = "source-over";
    mainCtx.strokeStyle = bg;
  }

  mainCtx.lineWidth = size;
  mainCtx.lineCap = "round";
  mainCtx.lineJoin = "round";
  mainCtx.beginPath();
  mainCtx.moveTo(x0, y0);
  mainCtx.lineTo(x1, y1);
  mainCtx.stroke();

  mainCtx.restore();
}

export const eraser: Tool = {
  id: "eraser",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const scratch = ctx.scratch as unknown as EraserScratch;
    scratch.lastX = p.x;
    scratch.lastY = p.y;

    // Draw a single dot.
    erase(ctx.main, p.x, p.y, p.x, p.y, ctx.size, ctx.eraserMode, ctx.bg);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as EraserScratch;
    if (scratch.lastX === undefined) return;

    const p = ctx.toDocCoords(e.clientX, e.clientY);
    erase(ctx.main, scratch.lastX, scratch.lastY, p.x, p.y, ctx.size, ctx.eraserMode, ctx.bg);
    scratch.lastX = p.x;
    scratch.lastY = p.y;
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as EraserScratch;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    if (scratch.lastX !== undefined) {
      erase(ctx.main, scratch.lastX, scratch.lastY, p.x, p.y, ctx.size, ctx.eraserMode, ctx.bg);
    }
    ctx.pushHistory();
    scratch.lastX = -1;
  },

  onCancel(ctx) {
    ctx.pushHistory();
  },
};
