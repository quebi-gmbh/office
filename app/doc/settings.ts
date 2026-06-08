/**
 * Document editor settings — schema, defaults, and localStorage migration.
 * Storage key: "office:docs:settings"
 *
 * Mirrors the /code editor's settings.ts pattern:
 * - Versioned schema so stale blobs are forward-migrated.
 * - migrate() deep-merges unknown localStorage data over defaults, dropping
 *   unknown keys and always re-stamping the current version.
 *
 * Version history:
 *   1 → original Tier 2 settings
 *   2 → Tier 3: added behaviour.focusMode, behaviour.typewriterMode,
 *               behaviour.targetWords, behaviour.versionIntervalMin;
 *               typography.paragraphSpacing, typography.firstLineIndent,
 *               typography.listStyle, typography.headingStyle, typography.customCss
 */

export const SETTINGS_STORAGE_KEY = "office:docs:settings";

export type PageWidth = "narrow" | "comfortable" | "wide" | "full";
export type FontFamily = "serif" | "sans" | "mono";
export type AutosaveMs = 500 | 1000 | 5000;
export type OutlineMode = "auto" | "always" | "off";
export type ListStyle =
  | "decimal"
  | "lower-alpha"
  | "lower-roman"
  | "upper-alpha"
  | "upper-roman";

export type DocSettings = {
  version: 2;
  page: {
    width: PageWidth;
  };
  typography: {
    fontFamily: FontFamily;
    fontSizeBase: number;
    lineHeight: number;
    smartTypography: boolean;
    /** Paragraph bottom margin in em (0.25–2.0). */
    paragraphSpacing: number;
    /** First-line indent in em (0 = off). */
    firstLineIndent: number;
    /** Ordered list numbering style. */
    listStyle: ListStyle;
    /** Additional CSS injected scoped to .ProseMirror. */
    customCss: string;
  };
  behaviour: {
    spellCheck: boolean;
    autosaveMs: AutosaveMs;
    outline: OutlineMode;
    /** Hide toolbar/sidebars — only the page remains. */
    focusMode: boolean;
    /** Keep active line vertically centred while typing. */
    typewriterMode: boolean;
    /** Target word count (0 = off). */
    targetWords: number;
    /** Auto-snapshot interval in minutes (0 = off). */
    versionIntervalMin: number;
  };
};

export const defaults: DocSettings = {
  version: 2,
  page: {
    width: "comfortable",
  },
  typography: {
    fontFamily: "sans",
    fontSizeBase: 16,
    lineHeight: 1.7,
    smartTypography: false,
    paragraphSpacing: 0.75,
    firstLineIndent: 0,
    listStyle: "decimal",
    customCss: "",
  },
  behaviour: {
    spellCheck: true,
    autosaveMs: 1000,
    outline: "auto",
    focusMode: false,
    typewriterMode: false,
    targetWords: 0,
    versionIntervalMin: 5,
  },
};

/**
 * Reads a raw localStorage value and returns a valid DocSettings object.
 * Unknown or invalid data falls back to defaults (deep merge).
 */
export function migrate(raw: unknown): DocSettings {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;

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
  return { ...merged, version: 2 };
}
