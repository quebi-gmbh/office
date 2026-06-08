/**
 * Doc editor file menu — a compact dropdown button in the toolbar.
 * Mirrors the shape of app/lib/code-editor/file-menu.tsx.
 *
 * Actions: Open, Save (Markdown), Export HTML, Print, Copy as HTML,
 * Copy as Markdown, Share URL.
 */
import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { useToast } from "~/components/Toast";
import {
  openDocument,
  importMarkdown,
  importHtml,
  exportMarkdown,
  exportHtml,
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
  | "save-md"
  | "export-html"
  | "print"
  | "copy-html"
  | "copy-md"
  | "share";

interface FileMenuProps {
  editor: Editor;
  title: string;
  settings: DocSettings;
  dirty: boolean;
  onImported: () => void; // called after a successful import so autosave fires
}

type MenuItem = {
  label: string;
  action: FileMenuAction;
  shortcut?: string;
  separator?: boolean;
};

const ITEMS: MenuItem[] = [
  { label: "Open…", action: "open", shortcut: "Ctrl+O" },
  { label: "Save as Markdown", action: "save-md", shortcut: "Ctrl+S", separator: true },
  { label: "Export as HTML", action: "export-html" },
  { label: "Print", action: "print", separator: true },
  { label: "Copy as HTML", action: "copy-html" },
  { label: "Copy as Markdown", action: "copy-md", separator: true },
  { label: "Share via URL", action: "share" },
];

export function FileMenu({ editor, title, settings, dirty, onImported }: FileMenuProps) {
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
            className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded border border-border bg-bg py-1 shadow-lg"
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
