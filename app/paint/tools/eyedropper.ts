/**
 * Eyedropper tool.
 *
 * Click picks the pixel colour from the main canvas:
 *   - Normal click → sets foreground colour.
 *   - Alt-click    → sets background colour.
 *
 * The picked hex is also pushed onto the recent-colours list via ctx.setFg/setBg.
 */
import { rgbaToHex } from "~/paint/lib/colour";
import type { Tool, PaintContext } from "~/paint/lib/types";

function pick(e: PointerEvent, ctx: PaintContext): void {
  const p = ctx.toDocCoords(e.clientX, e.clientY);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || x >= ctx.width || y < 0 || y >= ctx.height) return;

  const pixel = ctx.main.getImageData(x, y, 1, 1).data;
  const hex = rgbaToHex(pixel[0], pixel[1], pixel[2]);

  if (ctx.modifiers.alt) {
    ctx.setBg(hex);
  } else {
    ctx.setFg(hex);
  }
}

export const eyedropper: Tool = {
  id: "eyedropper",
  cursor: "crosshair",
  onPointerDown: pick,
  onPointerMove(e, ctx) {
    // Continuous pick while dragging — useful for sampling.
    if (e.buttons > 0) pick(e, ctx);
  },
  onPointerUp() {},
};
