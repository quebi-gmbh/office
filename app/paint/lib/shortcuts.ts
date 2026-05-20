/**
 * Keyboard shortcut registry.
 *
 * Each shortcut has:
 *   - keys: a string like 'Mod+Z', 'B', '[', '?'
 *       'Mod' resolves to Meta on macOS, Ctrl everywhere else.
 *       Letters use KeyboardEvent.code (KeyB) for layout independence.
 *       Symbols/punctuation use KeyboardEvent.key.
 *   - run: called when the combination fires.
 *   - when: optional predicate — if it returns false the shortcut is skipped.
 *
 * The registry is a plain array. useShortcuts (hooks/useShortcuts.ts) iterates
 * it on each keydown. Adding a shortcut is one entry here — no other place to update.
 */
import type { EngineState, ToolId } from "~/paint/lib/types";
import type { Engine } from "~/paint/engine";

export interface Shortcut {
  id: string;
  keys: string;
  label: string;
  group: "tools" | "edit" | "view" | "file" | "colour" | "help";
  when?: (state: EngineState) => boolean;
  run(engine: Engine, ev: KeyboardEvent): void;
}

// ─── Helper to detect macOS ────────────────────────────────────────────────
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

export function modKey(): "Meta" | "Control" {
  return isMac ? "Meta" : "Control";
}

export function modLabel(): string {
  return isMac ? "⌘" : "Ctrl";
}

// ─── Registry ─────────────────────────────────────────────────────────────

function toolShortcut(code: string, id: ToolId, label: string, key: string): Shortcut {
  return {
    id: `tool-${id}`,
    keys: key,
    label,
    group: "tools",
    run(engine) {
      engine.setTool(id);
    },
  };
}

export const SHORTCUTS: Shortcut[] = [
  // ── Tools
  toolShortcut("KeyB", "brush",      "Brush",       "B"),
  toolShortcut("KeyP", "pencil",     "Pencil",      "P"),
  toolShortcut("KeyE", "eraser",     "Eraser",      "E"),
  toolShortcut("KeyL", "line",       "Line",        "L"),
  toolShortcut("KeyR", "rect",       "Rectangle",   "R"),
  toolShortcut("KeyO", "ellipse",    "Ellipse",     "O"),
  toolShortcut("KeyG", "fill",       "Fill",        "G"),
  toolShortcut("KeyI", "eyedropper", "Eyedropper",  "I"),
  toolShortcut("KeyT", "text",       "Text",        "T"),

  // ── Brush size
  {
    id: "size-decrease",
    keys: "[",
    label: "Decrease brush size",
    group: "tools",
    run(engine, ev) {
      const state = engine.store.getSnapshot();
      engine.setSize(state.size - (ev.shiftKey ? 10 : 1));
    },
  },
  {
    id: "size-increase",
    keys: "]",
    label: "Increase brush size",
    group: "tools",
    run(engine, ev) {
      const state = engine.store.getSnapshot();
      engine.setSize(state.size + (ev.shiftKey ? 10 : 1));
    },
  },

  // ── Colour
  {
    id: "swap-colours",
    keys: "X",
    label: "Swap FG / BG",
    group: "colour",
    run(engine) {
      const state = engine.store.getSnapshot();
      const fg = state.fg;
      engine.setFg(state.bg === "transparent" ? "#ffffff" : state.bg);
      engine.setBg(fg);
    },
  },

  // ── Edit
  {
    id: "undo",
    keys: "Mod+Z",
    label: "Undo",
    group: "edit",
    run(engine, ev) {
      ev.preventDefault();
      engine.undo();
    },
  },
  {
    id: "redo",
    keys: "Mod+Shift+Z",
    label: "Redo",
    group: "edit",
    run(engine, ev) {
      ev.preventDefault();
      engine.redo();
    },
  },
  {
    id: "redo-y",
    keys: "Mod+Y",
    label: "Redo (alt)",
    group: "edit",
    run(engine, ev) {
      ev.preventDefault();
      engine.redo();
    },
  },

  // ── View
  {
    id: "zoom-fit",
    keys: "Mod+0",
    label: "Fit canvas to window",
    group: "view",
    run(engine, ev) {
      ev.preventDefault();
      engine.fitViewport?.();
    },
  },
  {
    id: "zoom-100",
    keys: "Mod+1",
    label: "100% zoom",
    group: "view",
    run(engine, ev) {
      ev.preventDefault();
      engine.resetZoom?.();
    },
  },

  // ── File
  {
    id: "paste-image",
    keys: "Mod+V",
    label: "Paste image from clipboard",
    group: "file",
    // Handled natively by the paste event listener in PaintApp — listed here for discoverability.
    run(_engine, ev) { ev.preventDefault(); },
  },
  {
    id: "export-dialog",
    keys: "Mod+S",
    label: "Export image…",
    group: "file",
    run(engine, ev) {
      ev.preventDefault();
      engine.openExportDialog?.();
    },
  },
  {
    id: "quick-save",
    keys: "Mod+Shift+S",
    label: "Quick-save PNG",
    group: "file",
    run(engine, ev) {
      ev.preventDefault();
      engine.quickSavePng?.();
    },
  },

  // ── Help (no run needed — handled directly in useShortcuts by id)
  {
    id: "help",
    keys: "?",
    label: "Keyboard shortcuts",
    group: "help",
    run() {
      // Handled by the UI — useShortcuts dispatches a help-open event.
    },
  },

  // ── Escape — cancel active drag / text overlay
  {
    id: "cancel",
    keys: "Escape",
    label: "Cancel / close",
    group: "edit",
    run(engine) {
      engine.cancelDrag();
      engine.cancelText();
    },
  },
];
