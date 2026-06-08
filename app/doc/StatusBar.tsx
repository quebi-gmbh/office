import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
  dirty?: boolean;
  lastSavedAt?: number | null;
  targetWords?: number;
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

export function StatusBar({
  editor,
  dirty = false,
  lastSavedAt = null,
  targetWords = 0,
}: Props) {
  const text = editor.getText();
  const words = countWords(text);
  const chars = text.length;
  const readingMins = Math.ceil(words / 200);

  const hasGoal = targetWords > 0;
  const progress = hasGoal ? Math.min(words / targetWords, 1) : 0;

  return (
    <div
      aria-live="polite"
      aria-label="Document statistics"
      className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-border px-4 py-1 text-xs text-muted"
    >
      {/* Word count — with optional goal */}
      <span className="flex items-center gap-1.5">
        {hasGoal ? (
          <>
            <span>
              {words} / {targetWords}{" "}
              {targetWords === 1 ? "word" : "words"}
            </span>
            <span
              className="relative h-1.5 w-16 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={words}
              aria-valuemax={targetWords}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width]"
                style={{ width: `${progress * 100}%` }}
              />
            </span>
          </>
        ) : (
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
        )}
      </span>

      <span>
        {chars} {chars === 1 ? "character" : "characters"}
      </span>
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
