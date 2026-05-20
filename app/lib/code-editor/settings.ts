/**
 * Code editor settings — schema, defaults, and localStorage migration.
 * Storage key: "office:code:settings"
 */

export const SETTINGS_STORAGE_KEY = "office:code:settings";

export type TabWidth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type AutosaveMs = 0 | 500 | 1000 | 5000;

export type CodeSettings = {
  version: 1;
  editor: {
    /** "off" = no wrap, "soft" = viewport wrap, number = column wrap */
    wrap: "off" | "soft";
    activeLine: boolean;
    brackets: boolean;
    /** Gate for the linting framework (wired in #23) */
    diagnostics: boolean;
  };
  display: {
    /** CSS font-family string; special values "system", "jetbrains-mono", "fira-code" */
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    lineNumbers: boolean;
    indentGuides: boolean;
    whitespace: boolean;
    trailingWhitespace: boolean;
    stickyScroll: boolean;
    minimap: boolean;
  };
  files: {
    indent: "spaces" | "tabs";
    tabWidth: TabWidth;
    autoDetectIndent: boolean;
    eol: "lf" | "crlf" | "auto";
    finalNewline: boolean;
    trimTrailingOnExport: boolean;
    autosaveMs: AutosaveMs;
    restoreLanguage: boolean;
  };
  theme: {
    /** "auto" follows prefers-color-scheme; "light"/"dark" force; anything
     *  else is a thememirror catalog ID (loaded lazily in #21). */
    mode: "auto" | "light" | "dark";
  };
  keymap: "default" | "vim" | "emacs";
};

export const defaults: CodeSettings = {
  version: 1,
  editor: {
    wrap: "off",
    activeLine: true,
    brackets: true,
    diagnostics: true,
  },
  display: {
    fontFamily: "system",
    fontSize: 14,
    lineHeight: 1.6,
    lineNumbers: true,
    indentGuides: false,
    whitespace: false,
    trailingWhitespace: false,
    stickyScroll: false,
    minimap: false,
  },
  files: {
    indent: "spaces",
    tabWidth: 2,
    autoDetectIndent: true,
    eol: "auto",
    finalNewline: false,
    trimTrailingOnExport: false,
    autosaveMs: 1000,
    restoreLanguage: true,
  },
  theme: {
    mode: "auto",
  },
  keymap: "default",
};

/**
 * Reads a raw localStorage value and returns a valid CodeSettings object.
 * Unknown or invalid data falls back to defaults (deep merge).
 */
export function migrate(raw: unknown): CodeSettings {
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
