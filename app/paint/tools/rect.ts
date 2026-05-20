/**
 * Rectangle tool — click-drag draws a rectangle on the preview canvas.
 * Shift constrains to a square.
 * Per-shape stroke / fill toggles from ctx.shape.
 */
import type { Tool, PaintContext } from "~/paint/lib/types";

interface RectScratch {
  startX?: number;
  startY?: number;
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  fg: string,
  size: number,
  stroke: boolean,
  fill: boolean,
  fillColour: string,
): void {
  let [left, top, w, h] = [
    Math.min(x0, x1),
    Math.min(y0, y1),
    Math.abs(x1 - x0),
    Math.abs(y1 - y0),
  ];
  if (w === 0 || h === 0) return;

  ctx.save();
  if (fill) {
    ctx.fillStyle = fillColour;
    ctx.fillRect(left, top, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = fg;
    ctx.lineWidth = size;
    ctx.strokeRect(left, top, w, h);
  }
  ctx.restore();
}

export const rect: Tool = {
  id: "rect",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const scratch = ctx.scratch as unknown as RectScratch;
    scratch.startX = p.x;
    scratch.startY = p.y;
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as RectScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    let [ex, ey] = [p.x, p.y];
    if (ctx.modifiers.shift) {
      const side = Math.min(Math.abs(ex - scratch.startX!), Math.abs(ey - scratch.startY!));
      ex = scratch.startX! + Math.sign(ex - scratch.startX!) * side;
      ey = scratch.startY! + Math.sign(ey - scratch.startY!) * side;
    }
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawRect(ctx.preview, scratch.startX!, scratch.startY!, ex, ey, ctx.fg, ctx.size, ctx.shape.stroke, ctx.shape.fill, ctx.bg);
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as RectScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    let [ex, ey] = [p.x, p.y];
    if (ctx.modifiers.shift) {
      const side = Math.min(Math.abs(ex - scratch.startX!), Math.abs(ey - scratch.startY!));
      ex = scratch.startX! + Math.sign(ex - scratch.startX!) * side;
      ey = scratch.startY! + Math.sign(ey - scratch.startY!) * side;
    }
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawRect(ctx.preview, scratch.startX!, scratch.startY!, ex, ey, ctx.fg, ctx.size, ctx.shape.stroke, ctx.shape.fill, ctx.bg);
    ctx.commitPreview();
    scratch.startX = undefined;
  },

  onCancel(ctx) {
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    const scratch = ctx.scratch as unknown as RectScratch;
    scratch.startX = undefined;
  },
};
