import type { Editor } from "@tiptap/react";
import { Baseline } from "lucide-react";
import { ToolBtn } from "../Toolbar";

interface Props {
  editor: Editor;
}

export function FootnoteButton({ editor }: Props) {
  return (
    <ToolBtn
      onClick={() => editor.chain().focus().addFootnote().run()}
      title="Insert footnote"
    >
      <Baseline size={13} />
    </ToolBtn>
  );
}
