import type { Editor } from "@tiptap/react";
import { SeparatorHorizontal } from "lucide-react";
import { ToolBtn } from "../Toolbar";

interface Props {
  editor: Editor;
}

export function PageBreakButton({ editor }: Props) {
  return (
    <ToolBtn
      onClick={() => editor.chain().focus().setPageBreak().run()}
      title="Insert page break (break-after: page in print)"
    >
      <SeparatorHorizontal size={13} />
    </ToolBtn>
  );
}
