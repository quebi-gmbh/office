/**
 * Custom template storage — save / load / delete user-defined templates.
 * Storage key: "office:docs:templates"
 */
import type { JSONContent } from "@tiptap/react";
import type { DocTemplate } from "./index";

export const TEMPLATES_STORAGE_KEY = "office:docs:templates";

function uid(): string {
  return (
    "custom-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

export function loadCustomTemplates(): DocTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "templates" in parsed &&
      Array.isArray((parsed as { templates: unknown }).templates)
    ) {
      return (parsed as { templates: DocTemplate[] }).templates;
    }
  } catch {
    // ignore
  }
  return [];
}

function persist(templates: DocTemplate[]): void {
  localStorage.setItem(
    TEMPLATES_STORAGE_KEY,
    JSON.stringify({ templates }),
  );
}

export function saveCustomTemplate(
  name: string,
  title: string,
  doc: JSONContent,
): DocTemplate {
  const templates = loadCustomTemplates();
  const entry: DocTemplate = {
    id: uid(),
    name,
    description: "Custom template",
    title,
    doc,
  };
  persist([...templates, entry]);
  return entry;
}

export function deleteCustomTemplate(id: string): void {
  persist(loadCustomTemplates().filter((t) => t.id !== id));
}
