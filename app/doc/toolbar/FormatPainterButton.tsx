/**
 * FormatPainterButton — copy marks from one selection and apply to another.
 *
 * First click:  capture all active marks from the current cursor position.
 * Second click: apply the captured marks to the current selection, clearing
 *               existing marks first. Pressing Escape cancels.
 */
import { useEffect, useRef, useState } from "react";
import { Paintbrush } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { Mark } from "@tiptap/pm/model";
import { ToolBtn } from "../Toolbar";

interface Props {
  editor: Editor;
}

export function FormatPainterButton({ editor }: Props) {
  const [active, setActive] = useState(false);
  const capturedMarks = useRef<Mark[]>([]);

  // Cancel with Escape
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  function handleClick() {
    if (!active) {
      // Capture marks at current cursor
      const { from } = editor.state.selection;
      const node = editor.state.doc.nodeAt(from > 0 ? from - 1 : 0);
      capturedMarks.current = node ? [...node.marks] : [];
      setActive(true);
    } else {
      // Apply captured marks to the current selection
      setActive(false);
      const chain = editor.chain().focus().unsetAllMarks();
      for (const mark of capturedMarks.current) {
        chain.setMark(mark.type.name, mark.attrs);
      }
      chain.run();
    }
  }

  return (
    <ToolBtn
      onClick={handleClick}
      active={active}
      title={active ? "Click target text to apply formatting" : "Format painter"}
    >
      <Paintbrush size={13} />
    </ToolBtn>
  );
}
