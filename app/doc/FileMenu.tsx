/**
 * Doc editor file menu — a compact dropdown button in the toolbar.
 * Mirrors the shape of app/lib/code-editor/file-menu.tsx.
 */
import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { useToast } from "~/components/Toast";
import {
  openDocument,
  openMarkdownFile,
  importMarkdown,
  importHtml,
  importDocx,
  exportMarkdown,
  exportHtml,
  exportDocx,
  exportPdf,
  exportDocPng,
  downloadFile,
  copyAsHtml,
  copyAsMarkdown,
  printDoc,
  shareUrl,
  filenameFromTitle,
} from "./io";
import type { DocSettings } from "./settings";

export type FileMenuAction =
  | "open"
  | "import-md"
  | "import-docx"
  | "save-md"
  | "export-html"
  | "export-docx"
  | "export-pdf"
  | "export-png"
  | "print"
  | "copy-html"
  | "copy-md"
  | "share"
  | "snapshot"
  | "history"
  | "new-from-template"
  | "save-as-template";

interface FileMenuProps {
  editor: Editor;
  title: string;
  settings: DocSettings;
  dirty: boolean;
  /** Called after a successful import so autosave fires. */
  onImported: () => void;
  /** Opens the version history drawer. */
  onOpenHistory?: () => void;
  /** Opens the template picker drawer. */
  onNewFromTemplate?: () => void;
}

type MenuItem = {
  label: string;
  action: FileMenuAction;
  shortcut?: string;
  separator?: boolean;
};

const ITEMS: MenuItem[] = [
  { label: "Open…",                  action: "open",             shortcut: "Ctrl+O" },
  { label: "Import Markdown…",       action: "import-md" },
  { label: "Import Word (.docx)…",   action: "import-docx" },
  { label: "New from template…",     action: "new-from-template", separator: true },
  { label: "Save as Markdown",       action: "save-md",          shortcut: "Ctrl+S" },
  { label: "Export as HTML",         action: "export-html" },
  { label: "Export as Word (.docx)", action: "export-docx" },
  { label: "Export as PDF",          action: "export-pdf" },
  { label: "Export as PNG image",    action: "export-png",        separator: true },
  { label: "Save snapshot",          action: "snapshot" },
  { label: "Version history…",       action: "history",           shortcut: "Ctrl+Shift+H" },
  { label: "Save as template…",      action: "save-as-template",  separator: true },
  { label: "Print",                  action: "print" },
  { label: "Copy as HTML",           action: "copy-html" },
  { label: "Copy as Markdown",       action: "copy-md",           separator: true },
  { label: "Share via URL",          action: "share" },
];

export function FileMenu({
  editor,
  title,
  settings,
  dirty,
  onImported,
  onOpenHistory,
  onNewFromTemplate,
}: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { show, ToastContainer } = useToast();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function handleAction(action: FileMenuAction) {
    setOpen(false);
    switch (action) {
      case "open": {
        if (dirty) {
          if (!confirm("You have unsaved changes. Discard and open a new file?")) return;
        }
        const result = await openDocument();
        if (!result) return;
        const lower = result.name.toLowerCase();
        if (lower.endsWith(".md") || lower.endsWith(".txt")) {
          await importMarkdown(editor, result.text);
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          await importHtml(editor, result.text);
        } else {
          editor.commands.setContent(`<p>${result.text}</p>`);
        }
        onImported();
        break;
      }
      case "import-md": {
        if (dirty) {
          if (!confirm("You have unsaved changes. Discard and import a Markdown file?")) return;
        }
        const result = await openMarkdownFile();
        if (!result) return;
        await importMarkdown(editor, result.text);
        onImported();
        break;
      }
      case "import-docx": {
        if (dirty) {
          if (!confirm("You have unsaved changes. Discard and import a Word document?")) return;
        }
        await importDocx(editor);
        onImported();
        break;
      }
      case "save-md": {
        const md = await exportMarkdown(editor);
        downloadFile(md, filenameFromTitle(title, "md"), "text/markdown");
        break;
      }
      case "export-html": {
        const html = exportHtml(editor, title, settings);
        downloadFile(html, filenameFromTitle(title, "html"), "text/html");
        break;
      }
      case "export-docx": {
        await exportDocx(editor, title);
        break;
      }
      case "export-pdf": {
        exportPdf();
        break;
      }
      case "export-png": {
        const el = editor.view.dom as HTMLElement;
        await exportDocPng(el, filenameFromTitle(title, "png"));
        break;
      }
      case "print": {
        printDoc();
        break;
      }
      case "copy-html": {
        await copyAsHtml(editor);
        show("HTML copied to clipboard");
        break;
      }
      case "copy-md": {
        await copyAsMarkdown(editor);
        show("Markdown copied to clipboard");
        break;
      }
      case "share": {
        const result = await shareUrl(title, editor.getJSON());
        await navigator.clipboard.writeText(result.url);
        if (result.oversized) {
          show("URL copied — document is large (>50 KB compressed)");
        } else {
          show("Share URL copied to clipboard");
        }
        break;
      }
      case "snapshot": {
        const { saveVersion } = await import("./versioning");
        saveVersion(title || "Untitled", editor.getJSON());
        show("Snapshot saved");
        break;
      }
      case "history": {
        onOpenHistory?.();
        break;
      }
      case "new-from-template": {
        onNewFromTemplate?.();
        break;
      }
      case "save-as-template": {
        const name = window.prompt("Template name:");
        if (!name?.trim()) return;
        const { saveCustomTemplate } = await import("./templates/storage");
        saveCustomTemplate(name.trim(), title, editor.getJSON());
        show(`Template "${name.trim()}" saved`);
        break;
      }
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          title="File"
          aria-label="File menu"
          className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs transition-colors hover:border-accent"
        >
          <FileText size={12} />
          <span>File</span>
          {dirty && (
            <span
              className="ml-0.5 h-1.5 w-1.5 rounded-full bg-accent"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </button>

        {open && (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded border border-border bg-bg py-1 shadow-lg"
          >
            {ITEMS.map((item) => (
              <div key={item.action}>
                {item.separator && (
                  <div className="my-1 h-px bg-border" role="separator" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void handleAction(item.action);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-border"
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <kbd className="ml-6 text-muted">{item.shortcut}</kbd>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ToastContainer />
    </>
  );
}
