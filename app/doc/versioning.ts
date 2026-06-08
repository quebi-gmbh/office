/**
 * Document versioning — snapshot-based version history in localStorage.
 *
 * Storage key: "office:docs:versions"
 * Format:      { versions: DocVersion[] }  (newest first, max 20)
 *
 * Display indices are NOT stored — derived from array position when rendering.
 */
import type { JSONContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

export const VERSIONS_STORAGE_KEY = "office:docs:versions";
const MAX_VERSIONS = 20;

export type DocVersion = {
  id: string;
  title: string;
  createdAt: number; // Unix ms
  doc: JSONContent;
};

function uid(): string {
  // Combine two random strings for a collision-resistant id
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

export function loadVersions(): DocVersion[] {
  try {
    const raw = localStorage.getItem(VERSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "versions" in parsed &&
      Array.isArray((parsed as { versions: unknown }).versions)
    ) {
      return (parsed as { versions: DocVersion[] }).versions;
    }
  } catch {
    // ignore
  }
  return [];
}

function persistVersions(versions: DocVersion[]): void {
  localStorage.setItem(
    VERSIONS_STORAGE_KEY,
    JSON.stringify({ versions }),
  );
}

/** Snapshot the current doc to version history. Returns the new entry. */
export function saveVersion(title: string, doc: JSONContent): DocVersion {
  const versions = loadVersions();
  const entry: DocVersion = {
    id: uid(),
    title: title || "Untitled",
    createdAt: performance.now() > 0 ? Date.now() : 0, // always available in browser
    doc,
  };
  // Prepend (newest first), cap at MAX_VERSIONS
  persistVersions([entry, ...versions].slice(0, MAX_VERSIONS));
  return entry;
}

export function deleteVersion(id: string): void {
  persistVersions(loadVersions().filter((v) => v.id !== id));
}

export function restoreVersion(
  version: DocVersion,
  editor: Editor,
  setTitle: (t: string) => void,
): void {
  editor.commands.setContent(version.doc);
  setTitle(version.title);
}
