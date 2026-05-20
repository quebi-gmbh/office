/**
 * Line tool — click-drag draws a straight line on the preview canvas.
 * Shift constrains to 0°, 45°, or 90°.
 * On pointerup, the preview is composited to main and history is pushed.
 */
import type { Tool, PaintContext } from "~/paint/lib/types";

interface LineScratch {
  startX?: number;
  startY?: number;
}

function snapAngle(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.sqrt(dx * dx + dy * dy);
  return [x0 + Math.cos(snapped) * len, y0 + Math.sin(snapped) * len];
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,
  x1: number, y1: number,
  fg: string,
  size: number,
): void {
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

export const line: Tool = {
  id: "line",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const scratch = ctx.scratch as unknown as LineScratch;
    scratch.startX = p.x;
    scratch.startY = p.y;
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
  },

  onPointerMove(e, ctx) {
    const scratch = ctx.scratch as unknown as LineScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    let [ex, ey] = [p.x, p.y];
    if (ctx.modifiers.shift) {
      [ex, ey] = snapAngle(scratch.startX, scratch.startY!, ex, ey);
    }
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawLine(ctx.preview, scratch.startX, scratch.startY!, ex, ey, ctx.fg, ctx.size);
  },

  onPointerUp(e, ctx) {
    const scratch = ctx.scratch as unknown as LineScratch;
    if (scratch.startX === undefined) return;
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    let [ex, ey] = [p.x, p.y];
    if (ctx.modifiers.shift) {
      [ex, ey] = snapAngle(scratch.startX, scratch.startY!, ex, ey);
    }
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    drawLine(ctx.preview, scratch.startX, scratch.startY!, ex, ey, ctx.fg, ctx.size);
    ctx.commitPreview();
    scratch.startX = undefined;
  },

  onCancel(ctx) {
    ctx.preview.clearRect(0, 0, ctx.width, ctx.height);
    const scratch = ctx.scratch as unknown as LineScratch;
    scratch.startX = undefined;
  },
};
