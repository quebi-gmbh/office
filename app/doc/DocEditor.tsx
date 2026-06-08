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
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";

// ── Inner editor (recreated when Bucket-B settings change) ────────────────────

function DocEditorCore({
  smartTypography,
  onSettingsClick,
  findOpen,
  onFindClose,
}: {
  smartTypography: boolean;
  onSettingsClick: () => void;
  findOpen: boolean;
  onFindClose: () => void;
}) {
  const { settings } = useDocsSettings();

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

  const { title, setTitle, scheduleAutosave } = useDocDraft(
    editor ?? null,
    settings.behaviour.autosaveMs,
  );

  // Initialise title from the loaded draft (once)
  const titleInitialized = useRef(false);
  useEffect(() => {
    if (titleInitialized.current) return;
    titleInitialized.current = true;
    setTitle(initialDraft.title);
  }, [initialDraft.title, setTitle]);

  // Handle legacy plain-text migration
  const migrated = useRef(false);
  useEffect(() => {
    if (!editor || migrated.current) return;
    migrated.current = true;
    if (initialDraft.legacyHtml) {
      editor.commands.setContent(initialDraft.legacyHtml);
      saveDraft({ title: initialDraft.title, doc: editor.getJSON() });
    }
  }, [editor, initialDraft]);

  // Wire autosave to content changes
  useEffect(() => {
    if (!editor) return;
    editor.on("update", scheduleAutosave);
    return () => {
      editor.off("update", scheduleAutosave);
    };
  }, [editor, scheduleAutosave]);

  // Sync document.title
  useEffect(() => {
    document.title = title ? `${title} — Office` : "Document — Office";
  }, [title]);
  useEffect(() => {
    return () => {
      document.title = "Office";
    };
  }, []);

  return (
    <>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10">
        {editor && (
          <Toolbar editor={editor} onSettingsClick={onSettingsClick} />
        )}
      </div>

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

        {/* Outline panel */}
        {editor && (
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

      {/* Status bar */}
      {editor && <StatusBar editor={editor} />}
    </>
  );
}

// ── Outer shell (manages settings, drawer, CSS vars, shortcuts) ───────────────

export function DocEditor() {
  const { settings } = useDocsSettings();
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
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Bucket-B: smartTypography toggles trigger editor recreation.
  // The `key` change unmounts DocEditorCore (flushing autosave in useDocDraft's
  // cleanup effect) then remounts it, which re-reads the now-saved draft.
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
