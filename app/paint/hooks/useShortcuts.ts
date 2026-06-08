/**
 * useShortcuts — registers a single window keydown listener that dispatches
 * to the shortcut registry.
 *
 * Filtering:
 *   - Shortcuts are NOT fired when the event target is an editable element
 *     (input, textarea, select, or contentEditable), EXCEPT for a small
 *     allowlist: Mod+Z, Mod+Shift+Z, Mod+Y, and Escape (which always fire).
 *
 * Key matching:
 *   - Letter shortcuts compare e.key (the character produced) for layout independence.
 *     Using e.key means Ctrl+Z fires on the key labelled Z regardless of physical position,
 *     so QWERTZ keyboards (where Y and Z are swapped vs QWERTY) work correctly.
 *   - Symbol shortcuts ([, ], ?, Delete, …) also compare e.key.
 *   - 'Mod+' prefix checks the platform-appropriate modifier (Meta on mac, Ctrl elsewhere).
 */
import { useEffect, useState } from "react";
import type { Engine } from "~/paint/engine";
import { SHORTCUTS, modKey } from "~/paint/lib/shortcuts";

const ALWAYS_FIRE_IDS = new Set(["undo", "redo", "redo-y", "cancel"]);

function isEditable(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable;
}

function matchesKeys(e: KeyboardEvent, keys: string): boolean {
  const parts = keys.split("+");
  const requireMod = parts.includes("Mod");
  const requireShift = parts.includes("Shift");
  const requireAlt = parts.includes("Alt");
  // The last part is the actual key.
  const keyPart = parts[parts.length - 1];

  if (requireMod && !e.getModifierState(modKey())) return false;
  if (requireShift && !e.shiftKey) return false;
  if (requireAlt && !e.altKey) return false;
  if (!requireAlt && e.altKey) return false;
  // Don't fire if unexpected modifiers are pressed.
  if (!requireMod && e.getModifierState(modKey())) return false;

  // Letters: compare the character produced (e.key) case-insensitively.
  // e.key is layout-aware: on QWERTZ the key labelled Z yields e.key="z",
  // correctly matching "Z" shortcuts, unlike e.code which is position-based.
  // Reject unexpected Shift so Shift+B doesn't trigger the B tool shortcut.
  if (/^[A-Z]$/.test(keyPart)) {
    if (!requireShift && e.shiftKey) return false;
    return e.key.toUpperCase() === keyPart;
  }
  // Digits: e.key gives "0"–"9" with no modifier on all standard layouts.
  if (/^[0-9]$/.test(keyPart)) {
    if (!requireShift && e.shiftKey) return false;
    return e.key === keyPart;
  }
  // Named keys
  if (keyPart === "Escape") return e.key === "Escape";
  // Symbols (?, [, ], Delete, Backspace, …) — compare e.key directly.
  // e.key already encodes the shift state: "/" → "/", "?" → "?", so no extra
  // shift-guard is needed; the comparison itself handles it.
  return e.key === keyPart;
}

export function useShortcuts(engine: Engine): { helpOpen: boolean; setHelpOpen: (v: boolean) => void } {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const editable = isEditable(e.target);

      for (const shortcut of SHORTCUTS) {
        if (editable && !ALWAYS_FIRE_IDS.has(shortcut.id)) continue;
        if (!matchesKeys(e, shortcut.keys)) continue;

        const state = engine.store.getSnapshot();
        if (shortcut.when && !shortcut.when(state)) continue;

        if (shortcut.id === "help") {
          setHelpOpen((v) => !v);
          e.preventDefault();
          return;
        }

        shortcut.run(engine, e);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine]);

  return { helpOpen, setHelpOpen };
}
