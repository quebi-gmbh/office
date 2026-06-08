/**
 * Apply DocSettings to the DOM.
 *
 * Bucket A settings (no editor recreation needed):
 *   - Page width  → --doc-max-width CSS custom property on the page wrapper
 *   - Font family → --doc-font
 *   - Font size   → --doc-font-size
 *   - Line height → --doc-line-height
 *   - Theme mode  → data-theme attribute on <html> (or removed for "auto")
 *
 * CSS in app.css picks up these vars inside .ProseMirror so ProseMirror content
 * reflows without any React/TipTap state change.
 *
 * Bucket B (smart typography) requires editor recreation — handled in DocEditor.
 */
import type { DocSettings } from "./settings";

const PAGE_WIDTH_MAP: Record<DocSettings["page"]["width"], string> = {
  narrow: "640px",
  comfortable: "800px",
  wide: "1000px",
  full: "100%",
};

const FONT_FAMILY_MAP: Record<DocSettings["typography"]["fontFamily"], string> =
  {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
  };

export function applyDocSettings(
  pageEl: HTMLElement | null,
  settings: DocSettings,
): void {
  if (pageEl) {
    pageEl.style.setProperty(
      "--doc-max-width",
      PAGE_WIDTH_MAP[settings.page.width],
    );
    pageEl.style.setProperty(
      "--doc-font",
      FONT_FAMILY_MAP[settings.typography.fontFamily],
    );
    pageEl.style.setProperty(
      "--doc-font-size",
      `${settings.typography.fontSizeBase}px`,
    );
    pageEl.style.setProperty(
      "--doc-line-height",
      String(settings.typography.lineHeight),
    );
  }

  // Theme: force or restore system default
  if (settings.theme.mode === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", settings.theme.mode);
  }
}

/**
 * Clean up any forced theme override when navigating away from /doc.
 * Call on component unmount.
 */
export function cleanupDocSettings(): void {
  document.documentElement.removeAttribute("data-theme");
}
