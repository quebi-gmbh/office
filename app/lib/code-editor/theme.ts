/**
 * Editor theming.
 *
 * - lightTheme  — a minimal CM6 theme that delegates colors to our Tailwind
 *                 CSS custom properties, so it follows prefers-color-scheme
 *                 automatically in "auto" mode.
 * - darkTheme   — the bundled One Dark theme.
 * - themeCompartment — the CM Compartment used to hot-swap themes without
 *                      recreating the editor.
 * - useAutoTheme() — a React hook that subscribes to
 *                    matchMedia("prefers-color-scheme: dark") and reconfigures
 *                    the compartment on change.
 */
import { useEffect } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

// ── Light theme ──────────────────────────────────────────────────────────────
// Uses our Tailwind CSS custom properties so it stays in sync with the rest of
// the UI and responds to OS color-scheme changes in "auto" mode.
export const lightTheme = CMEditorView.theme(
  {
    "&": {
      height: "100%",
      background: "var(--color-card)",
      color: "var(--color-fg)",
      fontFamily: "var(--font-mono)",
    },
    ".cm-content": {
      caretColor: "var(--color-fg)",
      padding: "0.75rem 0",
    },
    ".cm-gutters": {
      background: "var(--color-card)",
      color: "var(--color-muted)",
      border: "none",
      borderRight: "1px solid var(--color-border)",
    },
    ".cm-activeLineGutter": {
      background: "color-mix(in srgb, var(--color-border) 40%, transparent)",
    },
    ".cm-activeLine": {
      background: "color-mix(in srgb, var(--color-border) 40%, transparent)",
    },
    ".cm-selectionBackground, ::selection": {
      background: "color-mix(in srgb, var(--color-accent) 30%, transparent) !important",
    },
    ".cm-focused .cm-selectionBackground": {
      background: "color-mix(in srgb, var(--color-accent) 30%, transparent) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-fg)",
    },
    ".cm-matchingBracket": {
      background: "color-mix(in srgb, var(--color-accent) 25%, transparent)",
      outline: "1px solid var(--color-accent)",
    },
    ".cm-searchMatch": {
      background: "color-mix(in srgb, var(--color-accent) 25%, transparent)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      background: "color-mix(in srgb, var(--color-accent) 45%, transparent)",
    },
    ".cm-tooltip": {
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      boxShadow: "0 4px 12px rgba(0,0,0,.12)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
      color: "var(--color-fg)",
    },
    ".cm-panels": {
      background: "var(--color-card)",
      color: "var(--color-fg)",
      borderTop: "1px solid var(--color-border)",
    },
    ".cm-panel.cm-search label": {
      color: "var(--color-fg)",
    },
    ".cm-panel input, .cm-panel button, .cm-panel select": {
      background: "var(--color-bg)",
      border: "1px solid var(--color-border)",
      color: "var(--color-fg)",
      borderRadius: "4px",
    },
  },
  { dark: false },
);

export const darkTheme = oneDark;

// ── Compartment ──────────────────────────────────────────────────────────────
export const themeCompartment = new Compartment();

// ── Helper ───────────────────────────────────────────────────────────────────
export function getThemeExtension(isDark: boolean) {
  return isDark ? darkTheme : lightTheme;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
/**
 * Subscribes to prefers-color-scheme and hot-swaps the theme compartment when
 * the OS setting changes. Only active when `mode === "auto"`.
 */
export function useAutoTheme(
  viewRef: RefObject<EditorView | null>,
  mode: "auto" | "light" | "dark" = "auto",
) {
  useEffect(() => {
    if (mode !== "auto") {
      // Apply explicit mode immediately
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: themeCompartment.reconfigure(
          getThemeExtension(mode === "dark"),
        ),
      });
      return;
    }

    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: themeCompartment.reconfigure(getThemeExtension(mq.matches)),
      });
    };

    apply(); // sync immediately
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [viewRef, mode]);
}
