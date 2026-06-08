/**
 * Marquee (rectangular selection) tool.
 *
 * Drag to draw a selection rectangle; a click (< 2px drag) clears the selection.
 * The live marquee is drawn on the preview canvas during the drag.
 * On pointer-up the committed selection is stored in engine state via
 * ctx.setSelection / ctx.clearSelection; the marching-ants rAF loop in the
 * engine then takes over rendering on the preview canvas.
 */
import type { Tool, PaintContext } from "~/paint/lib/types";

interface SelectScratch {
  startX?: number;
  startY?: number;
}

/** Draw a static two-pass dashed rectangle (white + black at offset 4) on ctx. */
function drawMarquee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  // White pass
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineDashOffset = 0;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  // Black pass (offset by 4 to interleave)
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.lineDashOffset = 4;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

export const select: Tool = {
  id: "select",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const scratch = ctx.scratch as unknown as SelectScratch;
    scratch.startX = p.x;
    scratch.startY = p.y;
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as SelectScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const x = Math.min(scratch.startX, p.x);
    const y = Math.min(scratch.startY!, p.y);
    const w = Math.abs(p.x - scratch.startX);
    const h = Math.abs(p.y - scratch.startY!);
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawMarquee(ctx.preview, x, y, w, h);
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as SelectScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);

    const rawW = Math.abs(p.x - scratch.startX);
    const rawH = Math.abs(p.y - scratch.startY!);

    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);

    if (rawW >= 1 && rawH >= 1) {
      // Normalise to top-left and clamp to doc bounds.
      const rawX = Math.min(scratch.startX, p.x);
      const rawY = Math.min(scratch.startY!, p.y);
      const x = Math.max(0, Math.floor(rawX));
      const y = Math.max(0, Math.floor(rawY));
      const w = Math.min(ctx.width - x, Math.ceil(rawW));
      const h = Math.min(ctx.height - y, Math.ceil(rawH));
      if (w > 0 && h > 0) {
        ctx.setSelection({ x, y, w, h });
      } else {
        ctx.clearSelection();
      }
    } else {
      // Tiny drag / click → clear the selection.
      ctx.clearSelection();
    }

    scratch.startX = undefined;
  },

  onCancel(ctx) {
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    const scratch = ctx.scratch as unknown as SelectScratch;
    scratch.startX = undefined;
    // Do NOT clear the committed selection on cancel — only Esc does that.
  },
};
