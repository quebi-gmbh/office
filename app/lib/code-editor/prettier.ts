/**
 * Prettier-based document and selection formatting.
 *
 * Everything is lazy-loaded: `prettier/standalone` and its plugins are
 * separate async chunks so they never appear in the initial bundle.
 *
 * Format-on-save is gated by `settings.format.onSave`; manual formatting
 * is bound to Shift-Alt-F.
 */
import type { EditorView } from "@codemirror/view";
import type { CodeSettings } from "./settings";

// ── Parser map ────────────────────────────────────────────────────────────────

/** Map CM language IDs to Prettier parser names. */
const PRETTIER_PARSER: Record<string, string> = {
  javascript: "babel",
  typescript: "typescript",
  html:       "html",
  css:        "css",
  markdown:   "markdown",
  yaml:       "yaml",
  json:       "json",
};

// ── Plugin loader ─────────────────────────────────────────────────────────────

/**
 * Lazily load Prettier standalone and the plugins required for `parser`.
 * Returns null when Prettier can't handle the given language.
 */
async function loadPrettier(parser: string) {
  // prettier/standalone is the browser-safe entry point (no Node fs access)
  const prettier = await import("prettier/standalone");

  // estree + babel are always required as the base
  const estreeP  = import("prettier/plugins/estree");
  const babelP   = import("prettier/plugins/babel");

  const extra: Promise<unknown>[] = [];
  if (parser === "typescript") extra.push(import("prettier/plugins/typescript"));
  if (parser === "html")       extra.push(import("prettier/plugins/html"));
  if (parser === "css")        extra.push(import("prettier/plugins/postcss"));
  if (parser === "markdown")   extra.push(import("prettier/plugins/markdown"));
  if (parser === "yaml")       extra.push(import("prettier/plugins/yaml"));

  const [estree, babel, ...rest] = await Promise.all([estreeP, babelP, ...extra]);
  return { prettier, plugins: [estree, babel, ...rest] };
}

// ── Options builder ───────────────────────────────────────────────────────────

function buildOptions(settings: CodeSettings) {
  return {
    tabWidth:   settings.files.tabWidth,
    useTabs:    settings.files.indent === "tabs",
    printWidth: 100,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Format the entire document in place.
 * Returns true on success, false when the language isn't supported.
 * Throws on Prettier parse errors (caller should catch and toast).
 */
export async function formatDoc(
  view: EditorView,
  langId: string,
  settings: CodeSettings,
): Promise<boolean> {
  const parser = PRETTIER_PARSER[langId];
  if (!parser) return false;

  const { prettier, plugins } = await loadPrettier(parser);
  const source = view.state.doc.toString();

  const formatted = await prettier.format(source, {
    parser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: plugins as any,
    ...buildOptions(settings),
  });

  if (formatted === source) return true; // nothing to do

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: formatted },
    // Preserve cursor: clamp to new doc length
    selection: {
      anchor: Math.min(
        view.state.selection.main.anchor,
        formatted.length,
      ),
    },
  });
  return true;
}

/**
 * Format the current selection in place (falls back to full doc if no selection).
 */
export async function formatSelection(
  view: EditorView,
  langId: string,
  settings: CodeSettings,
): Promise<boolean> {
  const sel = view.state.selection.main;
  if (sel.empty) return formatDoc(view, langId, settings);

  const parser = PRETTIER_PARSER[langId];
  if (!parser) return false;

  const { prettier, plugins } = await loadPrettier(parser);
  const source = view.state.sliceDoc(sel.from, sel.to);

  const formatted = await prettier.format(source, {
    parser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: plugins as any,
    ...buildOptions(settings),
  });

  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: formatted },
  });
  return true;
}

/** Returns true when Prettier supports the given language ID. */
export function canFormat(langId: string): boolean {
  return langId in PRETTIER_PARSER;
}
