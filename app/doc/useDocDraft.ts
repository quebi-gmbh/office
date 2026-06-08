import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { saveDraft } from "./storage";

const AUTOSAVE_DELAY = 500; // ms

/**
 * Owns the document title and wires up debounced autosave.
 *
 * The editor instance is provided externally (created via `useEditor` in
 * DocEditor). Title state lives here so Toolbar and StatusBar don't need to
 * know about it.
 *
 * Autosave pattern mirrors `app/routes/code.tsx` ll. 96–106:
 * keep the latest values in refs so the setTimeout callback never captures
 * a stale closure, and flush once more on unmount so no keystrokes are lost.
 */
export function useDocDraft(editor: Editor | null) {
  const [title, setTitle] = useState("");

  // Refs so the autosave callback always sees the latest values
  const titleRef = useRef(title);
  const editorRef = useRef(editor);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    titleRef.current = title;
  });
  useEffect(() => {
    editorRef.current = editor;
  });

  const scheduleAutosave = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const ed = editorRef.current;
      if (!ed) return;
      saveDraft({ title: titleRef.current, doc: ed.getJSON() });
      timerRef.current = null;
    }, AUTOSAVE_DELAY);
  }, []);

  // Flush on unmount to prevent data loss on route change
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        const ed = editorRef.current;
        if (ed) saveDraft({ title: titleRef.current, doc: ed.getJSON() });
      }
    };
  }, []);

  return { title, setTitle, scheduleAutosave };
}
