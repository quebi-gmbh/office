/**
 * Ellipse tool — click-drag draws an ellipse on the preview canvas.
 * Shift constrains to a circle.
 * Per-shape stroke / fill toggles from ctx.shape.
 */
import type { Tool, PaintContext } from "~/paint/lib/types";

interface EllipseScratch {
  startX?: number;
  startY?: number;
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  fg: string,
  size: number,
  stroke: boolean,
  fill: boolean,
  fillColour: string,
): void {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  if (rx === 0 || ry === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fillColour;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = fg;
    ctx.lineWidth = size;
    ctx.stroke();
  }
  ctx.restore();
}

export const ellipse: Tool = {
  id: "ellipse",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const scratch = ctx.scratch as unknown as EllipseScratch;
    scratch.startX = p.x;
    scratch.startY = p.y;
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as EllipseScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    let [ex, ey] = [p.x, p.y];
    if (ctx.modifiers.shift) {
      const side = Math.min(Math.abs(ex - scratch.startX!), Math.abs(ey - scratch.startY!));
      ex = scratch.startX! + Math.sign(ex - scratch.startX!) * side;
      ey = scratch.startY! + Math.sign(ey - scratch.startY!) * side;
    }
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawEllipse(ctx.preview, scratch.startX!, scratch.startY!, ex, ey, ctx.fg, ctx.size, ctx.shape.stroke, ctx.shape.fill, ctx.bg);
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as EllipseScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    let [ex, ey] = [p.x, p.y];
    if (ctx.modifiers.shift) {
      const side = Math.min(Math.abs(ex - scratch.startX!), Math.abs(ey - scratch.startY!));
      ex = scratch.startX! + Math.sign(ex - scratch.startX!) * side;
      ey = scratch.startY! + Math.sign(ey - scratch.startY!) * side;
    }
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawEllipse(ctx.preview, scratch.startX!, scratch.startY!, ex, ey, ctx.fg, ctx.size, ctx.shape.stroke, ctx.shape.fill, ctx.bg);
    ctx.commitPreview();
    scratch.startX = undefined;
  },

  onCancel(ctx) {
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    const scratch = ctx.scratch as unknown as EllipseScratch;
    scratch.startX = undefined;
  },
};
