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
 *   - Letter shortcuts compare e.code (KeyB) for keyboard-layout independence.
 *   - Symbol shortcuts ([, ], ?, X) compare e.key.
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

  // Letter codes: single uppercase letter → e.code = 'KeyX'
  // Reject if Shift is held unexpectedly (Shift+B ≠ B shortcut, but ? = Shift+/ on purpose).
  if (/^[A-Z]$/.test(keyPart)) {
    if (!requireShift && e.shiftKey) return false;
    return e.code === `Key${keyPart}`;
  }
  // Digits — same rationale: Shift+1 = "!" on US layout, not "1".
  if (/^[0-9]$/.test(keyPart)) {
    if (!requireShift && e.shiftKey) return false;
    return e.code === `Digit${keyPart}`;
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
