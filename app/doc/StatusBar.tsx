import type { Editor } from "@tiptap/react";

interface Props {
  editor: Editor;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function StatusBar({ editor }: Props) {
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
    </div>
  );
}
