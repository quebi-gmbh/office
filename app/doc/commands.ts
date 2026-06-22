/**
 * Document editor command registry.
 * Mirrors app/lib/code-editor/commands.ts in structure.
 *
 * DocCommandContext holds callbacks injected by DocEditor so commands can
 * trigger UI actions without coupling to React internals.
 */
import type { Editor } from "@tiptap/react";

export type DocCommandContext = {
  editor: Editor | null;
  fileAction: (action: string) => void;
  openSettings: () => void;
  openFind: () => void;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  newFromTemplate: () => void;
  manualSnapshot: () => void;
  openHistory: () => void;
};

export type DocCommand = {
  id: string;
  title: string;
  group: string;
  shortcut?: string;
  run: (ctx: DocCommandContext) => void;
};

export function allDocCommands(): DocCommand[] {
  return [
    // ── File ──────────────────────────────────────────────────────────────────
    { id: "file-open",        title: "Open file…",          group: "File", shortcut: "Ctrl+O",       run: (c) => c.fileAction("open") },
    { id: "file-import-md",   title: "Import Markdown…",    group: "File",                            run: (c) => c.fileAction("import-md") },
    { id: "file-save-md",     title: "Save as Markdown",    group: "File", shortcut: "Ctrl+S",       run: (c) => c.fileAction("save-md") },
    { id: "file-export-html", title: "Export as HTML",      group: "File",                            run: (c) => c.fileAction("export-html") },
    { id: "file-export-docx", title: "Export as .docx",     group: "File",                            run: (c) => c.fileAction("export-docx") },
    { id: "file-export-pdf",  title: "Export as PDF",       group: "File",                            run: (c) => c.fileAction("export-pdf") },
    { id: "file-export-png",  title: "Export as PNG",       group: "File",                            run: (c) => c.fileAction("export-png") },
    { id: "file-print",       title: "Print",               group: "File",                            run: (c) => c.fileAction("print") },
    { id: "file-share",       title: "Share via URL",       group: "File",                            run: (c) => c.fileAction("share") },
    { id: "file-template",    title: "New from template…",  group: "File",                            run: (c) => c.newFromTemplate() },
    { id: "file-snapshot",    title: "Save snapshot",       group: "File",                            run: (c) => c.manualSnapshot() },
    { id: "file-history",     title: "Version history…",    group: "File", shortcut: "Ctrl+Shift+H", run: (c) => c.openHistory() },

    // ── Edit ──────────────────────────────────────────────────────────────────
    { id: "edit-undo",        title: "Undo",                group: "Edit", shortcut: "Ctrl+Z",       run: (c) => c.editor?.chain().focus().undo().run() },
    { id: "edit-redo",        title: "Redo",                group: "Edit", shortcut: "Ctrl+Shift+Z", run: (c) => c.editor?.chain().focus().redo().run() },
    { id: "edit-find",        title: "Find & replace",      group: "Edit", shortcut: "Ctrl+F",       run: (c) => c.openFind() },
    { id: "edit-clear-fmt",   title: "Clear formatting",    group: "Edit",                            run: (c) => c.editor?.chain().focus().clearNodes().unsetAllMarks().run() },

    // ── Insert ────────────────────────────────────────────────────────────────
    { id: "ins-h1",    title: "Heading 1",      group: "Insert", run: (c) => c.editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: "ins-h2",    title: "Heading 2",      group: "Insert", run: (c) => c.editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: "ins-h3",    title: "Heading 3",      group: "Insert", run: (c) => c.editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: "ins-para",  title: "Paragraph",      group: "Insert", run: (c) => c.editor?.chain().focus().setParagraph().run() },
    { id: "ins-ul",    title: "Bullet list",    group: "Insert", run: (c) => c.editor?.chain().focus().toggleBulletList().run() },
    { id: "ins-ol",    title: "Numbered list",  group: "Insert", run: (c) => c.editor?.chain().focus().toggleOrderedList().run() },
    { id: "ins-task",  title: "Task list",      group: "Insert", run: (c) => c.editor?.chain().focus().toggleTaskList().run() },
    { id: "ins-quote", title: "Blockquote",     group: "Insert", run: (c) => c.editor?.chain().focus().toggleBlockquote().run() },
    { id: "ins-code",  title: "Code block",     group: "Insert", run: (c) => c.editor?.chain().focus().toggleCodeBlock().run() },
    { id: "ins-table", title: "Table",          group: "Insert", run: (c) => c.editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "ins-hr",    title: "Horizontal rule",group: "Insert", run: (c) => c.editor?.chain().focus().setHorizontalRule().run() },
    { id: "ins-pb",    title: "Page break",     group: "Insert", run: (c) => c.editor?.chain().focus().setPageBreak().run() },
    { id: "ins-fn",    title: "Footnote",       group: "Insert", run: (c) => c.editor?.chain().focus().addFootnote().run() },

    // ── View ──────────────────────────────────────────────────────────────────
    { id: "view-focus",      title: "Toggle focus mode",      group: "View", shortcut: "F11", run: (c) => c.toggleFocusMode() },
    { id: "view-typewriter", title: "Toggle typewriter mode", group: "View",                  run: (c) => c.toggleTypewriterMode() },

    // ── Settings ──────────────────────────────────────────────────────────────
    { id: "settings-open", title: "Open settings", group: "Settings", shortcut: "Ctrl+,", run: (c) => c.openSettings() },
  ];
}
