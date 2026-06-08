/**
 * Document outline panel.
 *
 * Derives a heading tree by walking editor.state.doc on every update/
 * selectionUpdate (debounced). Each heading is a clickable entry that
 * focuses the editor and scrolls the heading into view via domAtPos.
 *
 * Visibility is controlled by `settings.behaviour.outline`:
 *   - "auto"   — shown when the document has ≥ 1 heading
 *   - "always" — always shown
 *   - "off"    — never shown
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { OutlineMode } from "../settings";

export type HeadingEntry = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  pos: number; // document position
};

interface OutlineProps {
  editor: Editor;
  mode: OutlineMode;
}

function extractHeadings(editor: Editor): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const level = node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6;
      const text = node.textContent;
      headings.push({ level, text, pos });
    }
  });
  return headings;
}

export function Outline({ editor, mode }: OutlineProps) {
  const [headings, setHeadings] = useState<HeadingEntry[]>(() =>
    extractHeadings(editor),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setHeadings(extractHeadings(editor));
    }, 100);
  }, [editor]);

  useEffect(() => {
    editor.on("update", refresh);
    editor.on("selectionUpdate", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", refresh);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor, refresh]);

  // Visibility logic
  const shouldShow =
    mode === "always" || (mode === "auto" && headings.length > 0);

  if (!shouldShow) return null;

  function handleClick(entry: HeadingEntry) {
    editor.commands.focus();
    const dom = editor.view.domAtPos(entry.pos + 1);
    if (dom.node instanceof Element) {
      dom.node.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (dom.node.parentElement) {
      dom.node.parentElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  return (
    <nav
      aria-label="Document outline"
      className="w-48 shrink-0 overflow-y-auto border-l border-border px-3 py-4 text-sm"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Outline
      </h3>
      {headings.length === 0 ? (
        <p className="text-xs text-muted">No headings yet</p>
      ) : (
        <ul className="space-y-0.5">
          {headings.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleClick(h)}
                title={h.text}
                className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-border hover:text-fg transition-colors"
                style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }}
              >
                {h.text || "(empty heading)"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
