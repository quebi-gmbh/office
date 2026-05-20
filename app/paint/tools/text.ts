/**
 * Text tool.
 *
 * On pointerdown: records the click position in engine state to request a
 * text overlay. The TextOverlay React component (ui/TextOverlay.tsx) watches
 * this state, renders a contentEditable div, and calls engine.commitText()
 * when the user blurs or presses Esc.
 *
 * The tool itself is intentionally thin — the rasterisation lives in the engine
 * method commitText() so the overlay component needs no canvas access.
 */
import type { Tool } from "~/paint/lib/types";

export const text: Tool = {
  id: "text",
  cursor: "text",

  onPointerDown(e, ctx) {
    const p = ctx.toDocCoords(e.clientX, e.clientY);
    // Store the placement position in scratch so the engine can
    // expose it as textOverlayPos in EngineState (done in engine.ts).
    ctx.scratch.textX = p.x;
    ctx.scratch.textY = p.y;
    ctx.scratch.requestOverlay = true;
  },

  onPointerMove() {},
  onPointerUp() {},

  onCancel(ctx) {
    ctx.scratch.requestOverlay = false;
  },
};
