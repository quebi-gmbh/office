import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { extensions } from "./extensions";
import { loadDraft, saveDraft } from "./storage";
import { useDocDraft } from "./useDocDraft";
import { useDocsSettings } from "./settings-context";
import { applyDocSettings, cleanupDocSettings } from "./apply-settings";
import { DocSettingsDrawer } from "./settings-drawer";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";

export function DocEditor() {
  const { settings } = useDocsSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const draftRef = useRef(loadDraft());
  const initialDraft = draftRef.current;

  const editor = useEditor({
    extensions,
    content: initialDraft.doc,
    editorProps: {
      attributes: {
        spellcheck: String(settings.behaviour.spellCheck),
        class: "doc-editor-body",
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
      // Persist immediately so next load picks up JSON format
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

  // ── Apply Bucket-A settings (CSS vars + theme) ────────────────────────────
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyDocSettings(pageRef.current, settings);
  }, [settings]);

  // Clean up forced theme on unmount (so other routes aren't affected)
  useEffect(() => {
    return () => {
      cleanupDocSettings();
    };
  }, []);

  // ── Sync document.title ───────────────────────────────────────────────────
  useEffect(() => {
    document.title = title ? `${title} — Office` : "Document — Office";
  }, [title]);

  // Restore default title on unmount
  useEffect(() => {
    return () => {
      document.title = "Office";
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
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10">
        {editor && (
          <Toolbar
            editor={editor}
            onSettingsClick={() => setDrawerOpen(true)}
          />
        )}
      </div>

      {/* Centered page */}
      <div
        ref={pageRef}
        className="mx-auto w-full flex-1 px-6 py-6"
        style={{ maxWidth: "var(--doc-max-width, 800px)" }}
      >
        {/* Title */}
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

        {/* Editor body */}
        <EditorContent editor={editor} />
      </div>

      {/* Status bar */}
      {editor && <StatusBar editor={editor} />}

      {/* Settings drawer */}
      <DocSettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
