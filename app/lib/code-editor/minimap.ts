/**
 * Lazy minimap loader — wraps @replit/codemirror-minimap.
 *
 * The minimap chunk is only fetched when the user first enables the setting.
 */
import type { Extension } from "@codemirror/state";

/**
 * Build the minimap extension (enabled).
 * Loaded lazily so the chunk never appears in the initial bundle.
 */
export async function loadMinimap(): Promise<Extension> {
  const { showMinimap } = await import("@replit/codemirror-minimap");
  return showMinimap.of({
    create: () => ({ dom: document.createElement("div") }),
    displayText: "blocks",
    showOverlay: "always",
  });
}
