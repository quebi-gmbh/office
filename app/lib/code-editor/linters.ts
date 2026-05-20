/**
 * Per-language inline linters for the code editor.
 *
 * - JSON  : synchronous JSON.parse — no extra deps.
 * - JS/TS : lazy acorn parse (JS only; TS silently skipped by acorn).
 * - YAML  : lazy js-yaml load.
 *
 * All linters are built via @codemirror/lint's `linter()` helper which
 * runs the check asynchronously on document changes.
 */
import { linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";

// ── JSON ──────────────────────────────────────────────────────────────────────

function jsonLinter(): Extension {
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc.toString();
    if (!doc.trim()) return diagnostics;
    try {
      JSON.parse(doc);
    } catch (e) {
      if (e instanceof SyntaxError) {
        // Chrome/Node report "position N"; Firefox does not always include it
        const match = /position (\d+)/i.exec(e.message);
        const pos = match ? Math.min(parseInt(match[1], 10), doc.length) : 0;
        diagnostics.push({
          from: pos,
          to: pos,
          severity: "error",
          message: e.message,
        });
      }
    }
    return diagnostics;
  });
}

// ── JavaScript / TypeScript (acorn) ──────────────────────────────────────────

async function jsLinter(): Promise<Extension> {
  const acorn = await import("acorn");
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc.toString();
    if (!doc.trim()) return diagnostics;
    try {
      acorn.parse(doc, { ecmaVersion: "latest", sourceType: "module" });
    } catch (e) {
      if (e instanceof SyntaxError) {
        // acorn attaches `.pos` (number) to its SyntaxError
        const pos = (e as SyntaxError & { pos?: number }).pos ?? 0;
        const safePos = Math.min(pos, doc.length);
        diagnostics.push({
          from: safePos,
          to: safePos,
          severity: "error",
          message: e.message,
        });
      }
    }
    return diagnostics;
  });
}

// ── YAML ──────────────────────────────────────────────────────────────────────

async function yamlLinter(): Promise<Extension> {
  const yaml = await import("js-yaml");
  return linter((view) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc.toString();
    if (!doc.trim()) return diagnostics;
    try {
      yaml.load(doc);
    } catch (e) {
      if (e && typeof e === "object" && "mark" in e) {
        // YAMLException has a `.mark.position` field
        const mark = (e as { mark?: { position?: number } }).mark;
        const pos = Math.min(mark?.position ?? 0, doc.length);
        diagnostics.push({
          from: pos,
          to: pos,
          severity: "error",
          message: (e as { message?: string }).message ?? String(e),
        });
      }
    }
    return diagnostics;
  });
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Return the appropriate linter Extension for the given language ID.
 * Returns an empty array when no linter is available or `enabled` is false.
 */
export async function getLinterForLang(
  langId: string,
  enabled: boolean,
): Promise<Extension> {
  if (!enabled) return [];
  switch (langId) {
    case "json":
      return jsonLinter();
    case "javascript":
    case "typescript":
      return jsLinter();
    case "yaml":
      return yamlLinter();
    default:
      return [];
  }
}
