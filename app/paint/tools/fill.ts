/**
 * Flood-fill (bucket) tool.
 *
 * On pointerdown: read the target pixel, run scanline fill on a copy of the
 * ImageData, write it back, then push history. No preview canvas is involved.
 *
 * NOTE: getImageData is only safe on non-tainted canvases. We only ever draw
 * from URL.createObjectURL (same-origin), so cross-origin taint cannot occur.
 */
import { floodFill } from "~/paint/lib/floodFill";
import { hexToRgba } from "~/paint/lib/colour";
import type { Tool, PaintContext } from "~/paint/lib/types";

export const fill: Tool = {
  id: "fill",
  cursor: "crosshair",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    const imageData = ctx.main.getImageData(0, 0, ctx.width, ctx.height);
    const { r, g, b, a } = hexToRgba(ctx.fg);
    floodFill(imageData.data, ctx.width, ctx.height, p.x, p.y, r, g, b, a, ctx.fillTolerance);
    ctx.main.putImageData(imageData, 0, 0);
    ctx.pushHistory();
  },

  onPointerMove() {},
  onPointerUp() {},
};
