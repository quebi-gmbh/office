import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
  dirty?: boolean;
  lastSavedAt?: number | null;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function StatusBar({ editor, dirty = false, lastSavedAt = null }: Props) {
  const text = editor.getText();
  const words = countWords(text);
  const chars = text.length;
  const readingMins = Math.ceil(words / 200);

  return (
    <div
      aria-live="polite"
      aria-label="Document statistics"
      className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-border px-4 py-1 text-xs text-muted"
    >
      <span>{words} {words === 1 ? "word" : "words"}</span>
      <span>{chars} {chars === 1 ? "character" : "characters"}</span>
      <span>~{readingMins} min read</span>

      {/* Save status — pushed to the right */}
      <span className="ml-auto flex items-center gap-1.5">
        {dirty && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent"
            title="Unsaved changes"
            aria-label="Unsaved changes"
          />
        )}
        {lastSavedAt !== null ? (
          <span>Saved {formatTime(lastSavedAt)}</span>
        ) : (
          <span>Not saved yet</span>
        )}
      </span>
    </div>
  );
}
