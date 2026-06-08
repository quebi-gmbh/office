import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { saveDraft } from "./storage";

/**
 * Owns the document title, autosave state (lastSavedAt, dirty), and
 * wires up debounced autosave.
 *
 * The editor instance is provided externally (created via `useEditor` in
 * DocEditor). Title state lives here so Toolbar and StatusBar don't need to
 * know about it.
 *
 * Autosave pattern mirrors `app/routes/code.tsx`:
 * keep the latest values in refs so the setTimeout callback never captures
 * a stale closure, and flush once more on unmount so no keystrokes are lost.
 *
 * @param editor      The active TipTap editor instance (or null while mounting).
 * @param autosaveMs  Debounce delay in ms from DocSettings (default 1000).
 */
export function useDocDraft(
  editor: Editor | null,
  autosaveMs: number = 1000,
) {
  const [title, setTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Refs so the autosave callback always sees the latest values
  const titleRef = useRef(title);
  const editorRef = useRef(editor);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveMsRef = useRef(autosaveMs);

  useEffect(() => { titleRef.current = title; });
  useEffect(() => { editorRef.current = editor; });
  useEffect(() => { autosaveMsRef.current = autosaveMs; });

  function doSave() {
    const ed = editorRef.current;
    if (!ed) return;
    saveDraft({ title: titleRef.current, doc: ed.getJSON() });
    setDirty(false);
    setLastSavedAt(Date.now());
  }

  const scheduleAutosave = useCallback(() => {
    setDirty(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      doSave();
      timerRef.current = null;
    }, autosaveMsRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Immediately flush any pending autosave (e.g. on Ctrl-S). */
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    doSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { title, setTitle, dirty, lastSavedAt, scheduleAutosave, flush };
}
