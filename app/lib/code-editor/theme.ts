/**
 * Editor theming.
 *
 * - lightTheme  — a minimal CM6 chrome theme that delegates colors to our
 *                 Tailwind CSS custom properties (Quebi Light tokens).
 * - lightThemeExtension — lightTheme plus the Quebi Light syntax highlight
 *                 style; the default editor theme ("auto"/"light").
 * - darkTheme   — the bundled One Dark theme (explicit opt-in).
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
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
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
      background: "var(--color-bg)",
      border: "1px solid var(--color-border)",
      boxShadow: "0 4px 12px rgba(0,0,0,.12)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      background: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
      color: "var(--color-fg)",
    },
    ".cm-panels": {
      background: "var(--color-bg)",
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

// ── Light syntax highlighting ────────────────────────────────────────────────
// Quebi Light semantic accents, deepened for legibility on white — mirrors the
// highlight.js palette in app.css.
const lightHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.operator, t.modifier], color: "#0f9d75" },
  { tag: [t.string, t.special(t.string), t.attributeValue], color: "#15803d" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#c2600c" },
  { tag: [t.comment, t.meta], color: "#6b7280", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7c3aed" },
  { tag: [t.typeName, t.standard(t.variableName), t.namespace], color: "#0e7490" },
  { tag: [t.className, t.tagName], color: "#be123c" },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: "#0f9d75" },
  { tag: t.variableName, color: "var(--color-fg)" },
  { tag: [t.punctuation, t.bracket], color: "var(--color-muted)" },
  { tag: t.link, color: "#0f9d75", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.invalid, color: "#be123c" },
]);

/** Full light editor extension: chrome theme + syntax colors. */
export const lightThemeExtension = [
  lightTheme,
  syntaxHighlighting(lightHighlightStyle),
];

export const darkTheme = oneDark;

// ── Compartment ──────────────────────────────────────────────────────────────
export const themeCompartment = new Compartment();

// ── Helper ───────────────────────────────────────────────────────────────────
// The site ships the Quebi Light theme; "auto"/"light" resolve to the light
// editor. Users can still explicitly pick "dark" (One Dark) in settings.
export function getThemeExtension(isDark: boolean) {
  return isDark ? darkTheme : lightThemeExtension;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
/**
 * Applies the editor theme from the `mode` setting. The site chrome is
 * light-only, so "auto" resolves to light; "dark" is an explicit opt-in to
 * One Dark for the editor surface only.
 */
export function useAutoTheme(
  viewRef: RefObject<EditorView | null>,
  mode: "auto" | "light" | "dark" = "auto",
) {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension(mode === "dark")),
    });
  }, [viewRef, mode]);
}
