/**
 * Apply DocSettings to the DOM.
 *
 * Bucket A (no editor recreation):
 *   Page width, font family, font size, line height, paragraph spacing,
 *   first-line indent, list style, custom CSS → CSS vars / injected <style>
 *   Theme mode                               → data-theme on <html>
 *
 * Bucket B (requires editor recreation):
 *   smartTypography — handled in DocEditor via key-change remount.
 */
import type { DocSettings } from "./settings";

const PAGE_WIDTH_MAP: Record<DocSettings["page"]["width"], string> = {
  narrow: "640px",
  comfortable: "800px",
  wide: "1000px",
  full: "100%",
};

const FONT_FAMILY_MAP: Record<DocSettings["typography"]["fontFamily"], string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
};

export function applyDocSettings(
  pageEl: HTMLElement | null,
  settings: DocSettings,
): void {
  if (pageEl) {
    pageEl.style.setProperty("--doc-max-width", PAGE_WIDTH_MAP[settings.page.width]);
    pageEl.style.setProperty("--doc-font", FONT_FAMILY_MAP[settings.typography.fontFamily]);
    pageEl.style.setProperty("--doc-font-size", `${settings.typography.fontSizeBase}px`);
    pageEl.style.setProperty("--doc-line-height", String(settings.typography.lineHeight));
    pageEl.style.setProperty(
      "--doc-paragraph-spacing",
      `${settings.typography.paragraphSpacing}em`,
    );
    pageEl.style.setProperty(
      "--doc-first-line-indent",
      settings.typography.firstLineIndent > 0
        ? `${settings.typography.firstLineIndent}em`
        : "0",
    );
    pageEl.style.setProperty(
      "--doc-list-style",
      settings.typography.listStyle,
    );
  }

  // Custom CSS — inject/update a <style> scoped to .ProseMirror
  const styleId = "doc-custom-css";
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  const css = settings.typography.customCss?.trim() ?? "";
  if (css) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `.ProseMirror { ${css} }`;
  } else if (styleEl) {
    styleEl.remove();
  }
}

/**
 * Clean up any DOM side effects when navigating away from /docs.
 */
export function cleanupDocSettings(): void {
  document.getElementById("doc-custom-css")?.remove();
  document.body.removeAttribute("data-focus-mode");
}
