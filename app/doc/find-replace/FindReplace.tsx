/**
 * Find & Replace modal.
 *
 * Reads plugin state on every editor transaction; dispatches actions back
 * through the ProseMirror plugin (findReplaceActions).
 *
 * Rendered inside DocEditorCore; shown/hidden via the `open` prop.
 * Ctrl-F opens it; Escape closes it; Enter in the find field advances to
 * the next match.
 */
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { X } from "lucide-react";
import { findReplaceKey, findReplaceActions } from "./plugin";

interface FindReplaceProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

export function FindReplace({ editor, open, onClose }: FindReplaceProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  const findInputRef = useRef<HTMLInputElement>(null);

  // Sync local state → plugin on every change
  useEffect(() => {
    if (!open) {
      findReplaceActions.close(editor);
      return;
    }
    findReplaceActions.open(editor);
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, [open, editor]);

  useEffect(() => {
    if (open) findReplaceActions.setQuery(editor, query);
  }, [query, open, editor]);

  useEffect(() => {
    if (open) findReplaceActions.setReplacement(editor, replacement);
  }, [replacement, open, editor]);

  useEffect(() => {
    if (open) findReplaceActions.setCaseSensitive(editor, caseSensitive);
  }, [caseSensitive, open, editor]);

  useEffect(() => {
    if (open) findReplaceActions.setRegex(editor, isRegex);
  }, [isRegex, open, editor]);

  // Read match state from plugin on every transaction
  useEffect(() => {
    function onTransaction() {
      const state = findReplaceKey.getState(editor.view.state);
      if (!state) return;
      setMatchCount(state.matches.length);
      setCurrentIndex(state.current);
    }
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor]);

  function handleNext() {
    findReplaceActions.next(editor);
    findReplaceActions.scrollToActive(editor);
  }
  function handlePrev() {
    findReplaceActions.prev(editor);
    findReplaceActions.scrollToActive(editor);
  }

  if (!open) return null;

  const counter =
    matchCount === 0
      ? "No results"
      : `${currentIndex + 1} / ${matchCount}`;

  return (
    <div
      role="dialog"
      aria-label="Find and replace"
      className="absolute right-4 top-12 z-50 w-80 rounded border border-border bg-bg p-3 shadow-xl"
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">
          Find & Replace
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close find & replace"
          className="rounded p-0.5 text-muted hover:bg-border hover:text-fg"
        >
          <X size={13} />
        </button>
      </div>

      {/* Find row */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          ref={findInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.shiftKey ? handlePrev() : handleNext();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Find"
          aria-label="Find"
          className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />

        {/* Match counter */}
        <span className="shrink-0 text-xs text-muted">{query ? counter : ""}</span>

        {/* Prev / Next */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={matchCount === 0}
          title="Previous match (Shift+Enter)"
          className="rounded border border-border bg-card px-1.5 py-1 text-xs hover:border-accent disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={matchCount === 0}
          title="Next match (Enter)"
          className="rounded border border-border bg-card px-1.5 py-1 text-xs hover:border-accent disabled:opacity-40"
        >
          ↓
        </button>
      </div>

      {/* Replace row */}
      <div className="mb-2 flex items-center gap-1.5">
        <input
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          placeholder="Replace"
          aria-label="Replace"
          className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => findReplaceActions.replaceCurrent(editor)}
          disabled={matchCount === 0}
          title="Replace current"
          className="shrink-0 rounded border border-border bg-card px-2 py-1 text-xs hover:border-accent disabled:opacity-40"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={() => findReplaceActions.replaceAll(editor)}
          disabled={matchCount === 0}
          title="Replace all"
          className="shrink-0 rounded border border-border bg-card px-2 py-1 text-xs hover:border-accent disabled:opacity-40"
        >
          All
        </button>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-3 text-xs text-muted">
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="accent-accent"
          />
          Case
        </label>
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            checked={isRegex}
            onChange={(e) => setIsRegex(e.target.checked)}
            className="accent-accent"
          />
          Regex
        </label>
      </div>
    </div>
  );
}
