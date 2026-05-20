/**
 * JSON-specific editor utilities: pretty-print and minify.
 *
 * Both operations replace the document content via a CM transaction so
 * undo history is preserved across the transform.
 */
import type { EditorView } from "@codemirror/view";

/**
 * Pretty-print the JSON document with 2-space indentation.
 * Returns an error message string on parse failure (caller should toast it).
 */
export function prettyJson(view: EditorView): string | null {
  const src = view.state.doc.toString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(src);
  } catch (e) {
    return e instanceof SyntaxError ? e.message : String(e);
  }
  const formatted = JSON.stringify(parsed, null, 2) + "\n";
  if (formatted === src) return null;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: formatted },
  });
  return null;
}

/**
 * Minify the JSON document (no whitespace).
 * Returns an error message string on parse failure.
 */
export function minifyJson(view: EditorView): string | null {
  const src = view.state.doc.toString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(src);
  } catch (e) {
    return e instanceof SyntaxError ? e.message : String(e);
  }
  const minified = JSON.stringify(parsed);
  if (minified === src) return null;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: minified },
  });
  return null;
}
