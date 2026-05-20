/**
 * Pencil tool — hard 1-pixel aliased line.
 *
 * We do NOT use lineWidth = 1 + stroke() because 2D canvas strokes are always
 * anti-aliased on all major browsers. Instead we iterate from the last point to
 * the current point with Bresenham's line algorithm and call fillRect(x, y, 1, 1)
 * for each pixel, which is truly aliased.
 *
 * For larger "pencil" sizes (size > 1) we draw a hard square stamp at each pixel.
 *
 * We draw directly to main (no preview compositing) so there's no alpha bleed from
 * overlapping pixels in a single stroke.
 */
import type { Tool, PaintContext } from "~/paint/lib/types";

interface PencilScratch {
  lastX: number;
  lastY: number;
}

/**
 * Bresenham line — calls drawPixel for each pixel on the line from (x0,y0) to (x1,y1).
 */
function bresenham(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  drawPixel: (x: number, y: number) => void,
): void {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    drawPixel(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function stamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fg: string,
): void {
  ctx.fillStyle = fg;
  const r = Math.floor(size / 2);
  ctx.fillRect(x - r, y - r, size, size);
}

export const pencil: Tool = {
  id: "pencil",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const scratch = ctx.scratch as unknown as PencilScratch;
    scratch.lastX = p.x;
    scratch.lastY = p.y;
    // Draw a single dot at the start position.
    stamp(ctx.main, p.x, p.y, ctx.size, ctx.fg);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as PencilScratch;
    if (scratch.lastX === undefined) return;

    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const size = ctx.size;
    const fg = ctx.fg;
    const mainCtx = ctx.main;

    bresenham(scratch.lastX, scratch.lastY, p.x, p.y, (px, py) => {
      stamp(mainCtx, px, py, size, fg);
    });

    scratch.lastX = p.x;
    scratch.lastY = p.y;
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as PencilScratch;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    if (scratch.lastX !== undefined) {
      bresenham(scratch.lastX, scratch.lastY, p.x, p.y, (px, py) => {
        stamp(ctx.main, px, py, ctx.size, ctx.fg);
      });
    }
    // Push history — pencil writes directly to main so we don't use commitPreview().
    ctx.pushHistory();
    scratch.lastX = -1;
    scratch.lastY = -1;
  },

  onCancel(ctx) {
    // Nothing to cancel for pencil — pixels were already written to main.
    // Push history so undo can recover the partial stroke.
    ctx.pushHistory();
  },
};
