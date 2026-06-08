/**
 * useTypewriter — keeps the cursor line vertically centred while typing.
 *
 * Subscribes to TipTap's selectionUpdate event and scrolls the active
 * paragraph into the vertical centre of the viewport (debounced 50 ms to
 * avoid fighting the browser's own scroll behaviour).
 */
import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

export function useTypewriter(editor: Editor | null, enabled: boolean): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor || !enabled) return;

    function scroll() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          const { head } = editor!.state.selection;
          const domInfo = editor!.view.domAtPos(Math.max(0, head - 1));
          let el: Node | null = domInfo.node;
          // Walk up to a block-level element
          while (el && el.nodeType !== 1) el = el.parentElement;
          if (el instanceof HTMLElement) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        } catch {
          // Ignore errors if editor is mid-update
        }
      }, 50);
    }

    editor.on("selectionUpdate", scroll);
    return () => {
      editor.off("selectionUpdate", scroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor, enabled]);
}
