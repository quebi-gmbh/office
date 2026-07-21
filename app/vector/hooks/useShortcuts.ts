import { useEffect } from "react";
import type { VectorEngine } from "~/vector/lib/engine";
import type { ToolId } from "~/vector/lib/types";

const TOOL_KEYS: Record<string, ToolId> = {
  v: "select",
  r: "rect",
  o: "ellipse",
  l: "line",
  p: "pen",
  b: "pencil",
  g: "polygon",
  s: "star",
  t: "text",
};

/**
 * Global keyboard shortcuts. Skips events originating from text inputs so the
 * inspector fields and the text-edit overlay keep normal typing behaviour.
 */
export function useShortcuts(
  engine: VectorEngine,
  handlers: {
    onExport?: () => void;
    onImport?: () => void;
    onZoomToSelection?: () => void;
    onFit?: () => void;
    onResetZoom?: () => void;
  },
): void {
  useEffect(() => {
    function isEditable(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isEditable(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod) {
        switch (key) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) engine.redo();
            else engine.undo();
            return;
          case "y":
            e.preventDefault();
            engine.redo();
            return;
          case "a":
            e.preventDefault();
            engine.selectAll();
            return;
          case "c":
            engine.copy();
            return;
          case "x":
            engine.cut();
            return;
          case "v":
            engine.paste();
            return;
          case "d":
            e.preventDefault();
            engine.duplicateSelection();
            return;
          case "g":
            e.preventDefault();
            if (e.shiftKey) engine.ungroup();
            else engine.group();
            return;
          case "s":
            e.preventDefault();
            handlers.onExport?.();
            return;
          case "o":
            e.preventDefault();
            handlers.onImport?.();
            return;
          case "]":
            e.preventDefault();
            engine.bringToFront();
            return;
          case "[":
            e.preventDefault();
            engine.sendToBack();
            return;
          case "0":
            e.preventDefault();
            handlers.onResetZoom?.();
            return;
          case "1":
            e.preventDefault();
            handlers.onFit?.();
            return;
          case "2":
            e.preventDefault();
            handlers.onZoomToSelection?.();
            return;
          default:
            return;
        }
      }

      switch (e.key) {
        case "Delete":
        case "Backspace":
          e.preventDefault();
          engine.deleteSelection();
          return;
        case "Escape":
          engine.clearSelection();
          engine.setTool("select");
          return;
      }

      if (TOOL_KEYS[key]) {
        engine.setTool(TOOL_KEYS[key]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, handlers]);
}
