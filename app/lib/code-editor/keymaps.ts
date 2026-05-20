/**
 * Lazy keymap loader for Vim / Emacs modes.
 *
 * Each alternative keymap is a separate async chunk so it only loads when
 * the user actually selects it in Settings.
 */
import type { Extension } from "@codemirror/state";

/**
 * Load the CM6 extension for the given keymap ID.
 * Returns an empty array for "default" (built-in CM bindings are always active).
 */
export async function loadKeymap(
  id: "default" | "vim" | "emacs",
): Promise<Extension> {
  if (id === "vim") {
    const { vim } = await import("@replit/codemirror-vim");
    return vim();
  }
  if (id === "emacs") {
    const { emacs } = await import("@replit/codemirror-emacs");
    return emacs();
  }
  return [];
}
