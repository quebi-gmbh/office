import type { JSONContent } from "@tiptap/react";

export const STORAGE_KEY = "office:doc:draft";

export type DocDraft = {
  title: string;
  doc: JSONContent;
};

/** Empty TipTap document to use when there is no saved draft. */
const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Load the saved draft from localStorage.
 *
 * Handles three cases:
 * 1. No entry → returns an empty draft.
 * 2. New format: `{ title, doc }` JSON → returns as-is.
 * 3. Legacy format: bare plain-text string → migrates by wrapping non-empty
 *    lines into `<p>` paragraphs. The caller passes this HTML to
 *    `editor.commands.setContent()` on first mount, which converts it to a
 *    proper TipTap JSON document and saves it back.
 */
export function loadDraft(): DocDraft & { legacyHtml?: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { title: "", doc: EMPTY_DOC };

  try {
    const parsed = JSON.parse(raw) as unknown;
    // Validate shape: must have a `doc` object
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "doc" in parsed &&
      typeof (parsed as { doc: unknown }).doc === "object"
    ) {
      return parsed as DocDraft;
    }
    // Parsed but unexpected shape — treat as fresh
    return { title: "", doc: EMPTY_DOC };
  } catch {
    // Not valid JSON — it's the legacy plain-text string.
    // Build an HTML string so the editor can convert it on first mount.
    const html = raw
      .split("\n")
      .map((line) => `<p>${line || "<br>"}</p>`)
      .join("");
    return { title: "", doc: EMPTY_DOC, legacyHtml: html };
  }
}

/** Persist the current draft to localStorage. */
export function saveDraft(draft: DocDraft): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}
