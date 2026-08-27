/**
 * Pan (hand) tool.
 *
 * Deliberately does nothing to the canvas. Panning itself lives in
 * `hooks/useViewport.ts`, which owns the pan/zoom transform and drives the
 * drag from the wrapper's pointer events — the same code path Space-hold uses.
 * This module only exists so the tool is a first-class `ToolId` the engine can
 * dispatch to (and so the toolbar/shortcut registry stay uniform).
 */
import type { Tool } from "~/paint/lib/types";

export const pan: Tool = {
  id: "pan",
  cursor: "grab",
  onPointerDown() {},
  onPointerMove() {},
  onPointerUp() {},
};
