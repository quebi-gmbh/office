/**
 * DocEditor — root component for the document editor at /doc.
 *
 * Split into two layers:
 *
 *   DocEditor        — outer shell; reads settings, applies Bucket-A CSS vars,
 *                      manages the settings drawer + keyboard shortcuts, syncs
 *                      document.title. Passes a React `key` to DocEditorCore
 *                      that changes when smartTypography is toggled, triggering
 *                      a clean remount (lossless: content flushes to localStorage
 *                      on unmount and reloads on the next mount).
 *
 *   DocEditorCore    — inner layer; creates and owns the TipTap editor for a
 *                      fixed set of extensions + settings.
 */
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { buildExtensions } from "./extensions";
import { loadDraft, saveDraft } from "./storage";
import { useDocDraft } from "./useDocDraft";
import { useDocsSettings } from "./settings-context";
import { applyDocSettings, cleanupDocSettings } from "./apply-settings";
import { DocSettingsDrawer } from "./settings-drawer";
import { FindReplace as FindReplaceModal } from "./find-replace/FindReplace";
import { Outline } from "./outline/Outline";
import { FileMenu } from "./FileMenu";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { DocCommandPalette } from "./DocCommandPalette";
import { VersionHistory } from "./VersionHistory";
import { TemplatePicker } from "./TemplatePicker";
import { useTypewriter } from "./useTypewriter";
import { saveVersion } from "./versioning";
import {
  openDocument,
  importMarkdown,
  importHtml,
  importDocx,
  exportMarkdown,
  exportHtml,
  exportDocx,
  exportPdf,
  exportDocPng,
  downloadFile,
  printDoc,
  shareUrl,
  filenameFromTitle,
  decodeShareHash,
} from "./io";
import type { DocCommandContext } from "./commands";
import type { DocTemplate } from "./templates/index";
import type { JSONContent } from "@tiptap/react";

// ── Inner editor (recreated when Bucket-B settings change) ────────────────────

function DocEditorCore({
  smartTypography,
  onSettingsClick,
  findOpen,
  onFindClose,
  onFindOpen,
  focusMode,
  onFocusModeToggle,
}: {
  smartTypography: boolean;
  onSettingsClick: () => void;
  findOpen: boolean;
  onFindClose: () => void;
  onFindOpen: () => void;
  focusMode: boolean;
  onFocusModeToggle: () => void;
}) {
  const { settings, update: updateSettings } = useDocsSettings();

  const draftRef = useRef(loadDraft());
  const initialDraft = draftRef.current;

  const editor = useEditor({
    extensions: buildExtensions(smartTypography),
    content: initialDraft.doc,
    editorProps: {
      attributes: {
        spellcheck: String(settings.behaviour.spellCheck),
        class: "doc-editor-body",
      },
      // Handle image paste (clipboard)
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        let handled = false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src, alt: "" }),
                ),
              );
            };
            reader.readAsDataURL(file);
            handled = true;
          }
        }
        return handled;
      },
      // Handle image drag-drop
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        let handled = false;
        for (const file of Array.from(files)) {
          if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            const pos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            reader.onload = () => {
              const src = reader.result as string;
              const alt = file.name;
              const node = view.state.schema.nodes.image.create({ src, alt });
              const tr = view.state.tr.insert(pos?.pos ?? 0, node);
              view.dispatch(tr);
            };
            reader.readAsDataURL(file);
            handled = true;
          }
        }
        return handled;
      },
    },
    immediatelyRender: false,
  });

  const { title, setTitle, dirty, lastSavedAt, scheduleAutosave, flush } =
    useDocDraft(editor ?? null, settings.behaviour.autosaveMs);

  // ── Stable ref for title (avoids stale closures in effects/intervals) ────────
  const titleRef = useRef(title);
  useEffect(() => { titleRef.current = title; }, [title]);

  // ── Typewriter mode ──────────────────────────────────────────────────────────
  useTypewriter(editor ?? null, settings.behaviour.typewriterMode);

  // ── Tier 3: panel / modal visibility ────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // ── Manual snapshot ──────────────────────────────────────────────────────────
  function manualSnapshot() {
    if (!editor) return;
    saveVersion(titleRef.current || "Untitled", editor.getJSON());
  }

  // ── Auto-snapshot interval ───────────────────────────────────────────────────
  useEffect(() => {
    const intervalMin = settings.behaviour.versionIntervalMin;
    if (!intervalMin || intervalMin <= 0 || !editor) return;
    const ms = intervalMin * 60 * 1000;
    const id = setInterval(() => {
      saveVersion(titleRef.current || "Untitled", editor.getJSON());
    }, ms);
    return () => clearInterval(id);
  }, [editor, settings.behaviour.versionIntervalMin]);

  // ── handleDocFileAction — used by the command palette ───────────────────────
  async function handleDocFileAction(action: string) {
    if (!editor) return;
    switch (action) {
      case "open": {
        if (dirty && !confirm("You have unsaved changes. Discard and open a new file?")) return;
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
        scheduleAutosave();
        break;
      }
      case "import-docx": {
        if (dirty && !confirm("Discard current document and import a Word file?")) return;
        await importDocx(editor);
        scheduleAutosave();
        break;
      }
      case "save-md": {
        const md = await exportMarkdown(editor);
        downloadFile(md, filenameFromTitle(titleRef.current, "md"), "text/markdown");
        break;
      }
      case "export-html": {
        const html = exportHtml(editor, titleRef.current, settings);
        downloadFile(html, filenameFromTitle(titleRef.current, "html"), "text/html");
        break;
      }
      case "export-docx": {
        await exportDocx(editor, titleRef.current);
        break;
      }
      case "export-pdf": {
        exportPdf();
        break;
      }
      case "export-png": {
        const el = editor.view.dom as HTMLElement;
        await exportDocPng(el, filenameFromTitle(titleRef.current, "png"));
        break;
      }
      case "print": {
        printDoc();
        break;
      }
      case "share": {
        const result = await shareUrl(titleRef.current, editor.getJSON());
        await navigator.clipboard.writeText(result.url);
        break;
      }
      case "snapshot": {
        manualSnapshot();
        break;
      }
      case "history": {
        setHistoryOpen(true);
        break;
      }
      case "new-from-template": {
        setTemplatePickerOpen(true);
        break;
      }
      case "save-as-template": {
        const name = window.prompt("Template name:");
        if (!name?.trim()) return;
        const { saveCustomTemplate } = await import("./templates/storage");
        saveCustomTemplate(name.trim(), titleRef.current, editor.getJSON());
        break;
      }
    }
  }

  // ── DocCommandContext ────────────────────────────────────────────────────────
  const cmdCtx: DocCommandContext = {
    editor: editor ?? null,
    fileAction: (action) => { void handleDocFileAction(action); },
    openSettings: onSettingsClick,
    openFind: onFindOpen,
    toggleFocusMode: onFocusModeToggle,
    toggleTypewriterMode: () =>
      updateSettings({
        behaviour: { typewriterMode: !settings.behaviour.typewriterMode },
      }),
    newFromTemplate: () => setTemplatePickerOpen(true),
    manualSnapshot,
    openHistory: () => setHistoryOpen(true),
  };

  // ── Initialise title from the loaded draft (once) ────────────────────────────
  const titleInitialized = useRef(false);
  useEffect(() => {
    if (titleInitialized.current) return;
    titleInitialized.current = true;
    setTitle(initialDraft.title);
  }, [initialDraft.title, setTitle]);

  // ── Decode #doc= share hash on first mount ───────────────────────────────────
  const hashDecoded = useRef(false);
  useEffect(() => {
    if (hashDecoded.current || !editor) return;
    hashDecoded.current = true;
    const hash = location.hash;
    if (!hash.includes("doc=")) return;
    void (async () => {
      const result = await decodeShareHash(hash);
      if (!result) return;
      const docIsEmpty =
        !initialDraft.title &&
        editor.state.doc.textContent.trim() === "";
      if (
        docIsEmpty ||
        confirm("Load shared document? Your current document will be replaced.")
      ) {
        editor.commands.setContent(result.doc as JSONContent);
        setTitle(result.title ?? "");
        history.replaceState(null, "", location.pathname + location.search);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // ── Handle legacy plain-text migration ──────────────────────────────────────
  const migrated = useRef(false);
  useEffect(() => {
    if (!editor || migrated.current) return;
    migrated.current = true;
    if (initialDraft.legacyHtml) {
      editor.commands.setContent(initialDraft.legacyHtml);
      saveDraft({ title: initialDraft.title, doc: editor.getJSON() });
    }
  }, [editor, initialDraft]);

  // ── Wire autosave to content changes ─────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    editor.on("update", scheduleAutosave);
    return () => {
      editor.off("update", scheduleAutosave);
    };
  }, [editor, scheduleAutosave]);

  // ── Sync document.title ──────────────────────────────────────────────────────
  useEffect(() => {
    document.title = title ? `${title} — Office` : "Document — Office";
  }, [title]);
  useEffect(() => {
    return () => {
      document.title = "Office";
    };
  }, []);

  // ── Ctrl-S to force save ─────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") {
        e.preventDefault();
        flush();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flush]);

  // ── Ctrl-Shift-P (palette) · Ctrl-Shift-H (history) ─────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setHistoryOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Template selection handler ───────────────────────────────────────────────
  function handleTemplateSelect(template: DocTemplate) {
    if (!editor) return;
    if (dirty && !confirm("Replace current document with this template?")) return;
    editor.commands.setContent(template.doc);
    setTitle(template.title);
    scheduleAutosave();
    setTemplatePickerOpen(false);
  }

  return (
    <>
      {/* Sticky toolbar + file menu — hidden in focus mode */}
      {!focusMode && (
        <div className="sticky top-0 z-10 flex flex-col">
          {/* File menu bar */}
          <div className="flex items-center gap-1 border-b border-border bg-bg px-3 py-1">
            {editor && (
              <FileMenu
                editor={editor}
                title={title}
                settings={settings}
                dirty={dirty}
                onImported={scheduleAutosave}
                onOpenHistory={() => setHistoryOpen(true)}
                onNewFromTemplate={() => setTemplatePickerOpen(true)}
              />
            )}
          </div>
          {/* Formatting toolbar */}
          {editor && (
            <Toolbar editor={editor} onSettingsClick={onSettingsClick} />
          )}
        </div>
      )}

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleAutosave();
        }}
        placeholder="Untitled document"
        aria-label="Document title"
        className="mb-4 w-full border-b border-transparent bg-transparent text-3xl font-bold tracking-tight text-fg placeholder:text-muted/50 focus:border-border focus:outline-none"
      />

      {/* Editor body + optional outline (side by side) */}
      <div className="relative flex flex-1 gap-0 min-h-0">
        <div className="flex-1 min-w-0">
          <EditorContent editor={editor} />
        </div>

        {/* Outline panel — hidden in focus mode */}
        {editor && !focusMode && (
          <Outline editor={editor} mode={settings.behaviour.outline} />
        )}

        {/* Find & Replace modal (absolutely positioned over the editor) */}
        {editor && (
          <FindReplaceModal
            editor={editor}
            open={findOpen}
            onClose={onFindClose}
          />
        )}
      </div>

      {/* Status bar — hidden in focus mode */}
      {editor && !focusMode && (
        <StatusBar
          editor={editor}
          dirty={dirty}
          lastSavedAt={lastSavedAt}
          targetWords={settings.behaviour.targetWords}
        />
      )}

      {/* Tier 3: Command palette (Ctrl-Shift-P) */}
      {editor && (
        <DocCommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          ctx={cmdCtx}
        />
      )}

      {/* Tier 3: Version history drawer (Ctrl-Shift-H) */}
      {editor && (
        <VersionHistory
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          editor={editor}
          title={title}
          setTitle={setTitle}
          onRestored={scheduleAutosave}
        />
      )}

      {/* Tier 3: Template picker drawer */}
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={handleTemplateSelect}
      />
    </>
  );
}

// ── Outer shell (manages settings, drawer, CSS vars, shortcuts) ───────────────

export function DocEditor() {
  const { settings, update: updateSettings } = useDocsSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  // ── Apply Bucket-A settings (CSS vars + theme) ────────────────────────────
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    applyDocSettings(pageRef.current, settings);
  }, [settings]);
  useEffect(() => {
    return () => {
      cleanupDocSettings();
    };
  }, []);

  // ── Focus mode → data-focus-mode on body ──────────────────────────────────
  useEffect(() => {
    if (settings.behaviour.focusMode) {
      document.body.setAttribute("data-focus-mode", "");
    } else {
      document.body.removeAttribute("data-focus-mode");
    }
    return () => {
      document.body.removeAttribute("data-focus-mode");
    };
  }, [settings.behaviour.focusMode]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === ",") {
        e.preventDefault();
        setDrawerOpen(true);
      }
      if (mod && e.key === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
      if (e.key === "F11") {
        e.preventDefault();
        updateSettings({
          behaviour: { focusMode: !settings.behaviour.focusMode },
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // settings.behaviour.focusMode is needed so the F11 toggle sees the current value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.behaviour.focusMode]);

  // Bucket-B: smartTypography toggles trigger editor recreation.
  const smartTypoKey = settings.typography.smartTypography ? "smart" : "plain";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Centered page — CSS vars set on this element by applyDocSettings */}
      <div
        ref={pageRef}
        className="mx-auto flex w-full flex-1 flex-col px-6 py-6"
        style={{ maxWidth: "var(--doc-max-width, 800px)" }}
      >
        <DocEditorCore
          key={smartTypoKey}
          smartTypography={settings.typography.smartTypography}
          onSettingsClick={() => setDrawerOpen(true)}
          findOpen={findOpen}
          onFindClose={() => setFindOpen(false)}
          onFindOpen={() => setFindOpen(true)}
          focusMode={settings.behaviour.focusMode}
          onFocusModeToggle={() =>
            updateSettings({
              behaviour: { focusMode: !settings.behaviour.focusMode },
            })
          }
        />
      </div>

      {/* Settings drawer */}
      <DocSettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
