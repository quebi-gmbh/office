/**
 * Status bar for the code editor.
 *
 * A CM ViewPlugin tracks cursor/selection/document state and publishes it
 * via useSyncExternalStore so the React status bar re-renders reactively
 * without any extra state management library.
 */
import { useSyncExternalStore } from "react";
import type { EditorView } from "@codemirror/view";
import { ViewPlugin } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import type { Lang } from "./languages";
import { languages } from "./languages";

// ── Editor state snapshot ────────────────────────────────────────────────────
export type EditorStatus = {
  line: number;
  col: number;
  selectionSize: number;
  totalLines: number;
  byteSize: number;
};

const defaultStatus: EditorStatus = {
  line: 1,
  col: 1,
  selectionSize: 0,
  totalLines: 1,
  byteSize: 0,
};

// ── Pub/sub store (one per editor instance) ──────────────────────────────────
type Listener = () => void;

class StatusStore {
  private listeners = new Set<Listener>();
  snapshot: EditorStatus = defaultStatus;

  update(next: EditorStatus) {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;
}

// ── ViewPlugin factory ────────────────────────────────────────────────────────
/** Creates a [plugin, store] pair. Mount the plugin in CM extensions. */
export function createStatusPlugin() {
  const store = new StatusStore();

  const plugin = ViewPlugin.define((view) => {
    const push = (v: EditorView) => {
      const sel = v.state.selection.main;
      const line = v.state.doc.lineAt(sel.head);
      const text = v.state.doc.toString();
      store.update({
        line: line.number,
        col: sel.head - line.from + 1,
        selectionSize: sel.empty ? 0 : sel.to - sel.from,
        totalLines: v.state.doc.lines,
        byteSize: new TextEncoder().encode(text).length,
      });
    };
    push(view);
    return {
      update(u: ViewUpdate) {
        if (u.selectionSet || u.docChanged) push(u.view);
      },
    };
  });

  return [plugin, store] as const;
}

// ── React hook ───────────────────────────────────────────────────────────────
export function useEditorStatus(store: StatusStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

// ── Status bar component ──────────────────────────────────────────────────────
type StatusBarProps = {
  store: StatusStore;
  activeLang: Lang;
  onLanguageChange: (id: string) => void;
  /** Live indent label from settings, e.g. "Spaces: 2" or "Tabs" */
  indent?: string;
  /** Live EOL label from settings, e.g. "LF" or "CRLF" */
  eol?: string;
  onIndentClick?: () => void;
  onEolClick?: () => void;
  className?: string;
};

export function StatusBar({
  store,
  activeLang,
  onLanguageChange,
  indent = "Spaces: 2",
  eol = "LF",
  onIndentClick,
  onEolClick,
  className,
}: StatusBarProps) {
  const status = useEditorStatus(store);
  const { line, col, selectionSize, totalLines, byteSize } = status;

  const byteLabel =
    byteSize < 1024
      ? `${byteSize} B`
      : byteSize < 1024 * 1024
        ? `${(byteSize / 1024).toFixed(1)} KB`
        : `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;

  const common = languages.filter((l) => l.group === "Common");
  const more = languages.filter((l) => l.group === "More");

  return (
    <div
      className={`flex items-center gap-4 select-none overflow-x-auto ${className ?? ""}`}
    >
      {/* Cursor position */}
      <span className="whitespace-nowrap">
        Ln {line}, Col {col}
        {selectionSize > 0 && (
          <span className="ml-1">({selectionSize} selected)</span>
        )}
      </span>

      {/* Document stats */}
      <span className="whitespace-nowrap text-muted">
        {totalLines} lines · {byteLabel}
      </span>

      {/* Spacer */}
      <span className="flex-1" />

      {/* Indent indicator */}
      <button
        className="whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-border transition-colors"
        onClick={onIndentClick}
        title="Indent settings"
        type="button"
      >
        {indent}
      </button>

      {/* EOL indicator */}
      <button
        className="whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-border transition-colors"
        onClick={onEolClick}
        title="Line ending settings"
        type="button"
      >
        {eol}
      </button>

      {/* Encoding (read-only) */}
      <span className="whitespace-nowrap text-muted">UTF-8</span>

      {/* Language picker */}
      <select
        className="bg-transparent text-inherit border border-border rounded px-1.5 py-0.5 text-xs cursor-pointer focus:outline-none focus:border-accent"
        value={activeLang.id}
        onChange={(e) => onLanguageChange(e.target.value)}
        title="Select language"
      >
        <optgroup label="Common">
          {common.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="More">
          {more.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
