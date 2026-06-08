import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { extensions } from "./extensions";
import { loadDraft, saveDraft } from "./storage";
import { useDocDraft } from "./useDocDraft";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";

export function DocEditor() {
  const draftRef = useRef(loadDraft());
  const initialDraft = draftRef.current;

  const editor = useEditor({
    extensions,
    content: initialDraft.doc,
    editorProps: {
      attributes: {
        spellcheck: "true",
        class: "doc-editor-body",
      },
    },
    immediatelyRender: false,
  });

  const { title, setTitle, scheduleAutosave } = useDocDraft(editor ?? null);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10">
        {editor && <Toolbar editor={editor} />}
      </div>

      {/* Centered page */}
      <div className="mx-auto w-full max-w-[800px] flex-1 px-6 py-6">
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
    </div>
  );
}
