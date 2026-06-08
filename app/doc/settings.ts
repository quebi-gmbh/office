/**
 * Document editor settings — schema, defaults, and localStorage migration.
 * Storage key: "office:docs:settings"
 *
 * Mirrors the /code editor's settings.ts pattern:
 * - Versioned schema (version: 1) so stale blobs are forward-migrated.
 * - migrate() deep-merges unknown localStorage data over defaults, dropping
 *   unknown keys and always re-stamping the current version.
 */

export const SETTINGS_STORAGE_KEY = "office:docs:settings";

export type PageWidth = "narrow" | "comfortable" | "wide" | "full";
export type FontFamily = "serif" | "sans" | "mono";
export type AutosaveMs = 500 | 1000 | 5000;
export type OutlineMode = "auto" | "always" | "off";
export type ThemeMode = "auto" | "light" | "dark";

export type DocSettings = {
  version: 1;
  page: {
    /** Max content width of the centered page area. */
    width: PageWidth;
  };
  typography: {
    /** Base body font family for the document content. */
    fontFamily: FontFamily;
    /** Base font size in px applied to .ProseMirror. */
    fontSizeBase: number;
    /** Line height multiplier. */
    lineHeight: number;
    /**
     * Enable @tiptap/extension-typography (smart quotes, em-dashes, …).
     * Toggling this requires editor recreation — see DocEditor.tsx.
     */
    smartTypography: boolean;
  };
  behaviour: {
    /** Pass spellcheck attribute to the editor surface. */
    spellCheck: boolean;
    /** Debounce delay (ms) between last keystroke and autosave. */
    autosaveMs: AutosaveMs;
    /**
     * Outline panel visibility:
     *   auto   — show when the doc has ≥ 1 heading (default)
     *   always — always visible
     *   off    — never shown
     */
    outline: OutlineMode;
  };
  theme: {
    /**
     * "auto"  — follow prefers-color-scheme (default; no data-theme override)
     * "light" — force light tokens via :root[data-theme="light"]
     * "dark"  — force dark tokens  via :root[data-theme="dark"]
     */
    mode: ThemeMode;
  };
};

export const defaults: DocSettings = {
  version: 1,
  page: {
    width: "comfortable",
  },
  typography: {
    fontFamily: "sans",
    fontSizeBase: 16,
    lineHeight: 1.7,
    smartTypography: false,
  },
  behaviour: {
    spellCheck: true,
    autosaveMs: 1000,
    outline: "auto",
  },
  theme: {
    mode: "auto",
  },
};

/**
 * Reads a raw localStorage value and returns a valid DocSettings object.
 * Unknown or invalid data falls back to defaults (deep merge).
 */
export function migrate(raw: unknown): DocSettings {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;

  // Deep merge: only copy keys that exist in defaults so unknown keys are dropped.
  function merge<T extends object>(def: T, src: unknown): T {
    if (!src || typeof src !== "object") return def;
    const s = src as Record<string, unknown>;
    const result = { ...def } as Record<string, unknown>;
    for (const key of Object.keys(def) as (keyof T)[]) {
      const defVal = def[key];
      const srcVal = s[key as string];
      if (
        defVal !== null &&
        typeof defVal === "object" &&
        !Array.isArray(defVal)
      ) {
        result[key as string] = merge(defVal as object, srcVal);
      } else if (srcVal !== undefined) {
        result[key as string] = srcVal;
      }
    }
    return result as T;
  }

  const merged = merge(defaults, r);
  // Always stamp the current version
  return { ...merged, version: 1 };
}
