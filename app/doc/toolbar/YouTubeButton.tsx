import type { Editor } from "@tiptap/react";
import { Video } from "lucide-react";
import { ToolBtn } from "../Toolbar";

interface Props {
  editor: Editor;
}

export function YouTubeButton({ editor }: Props) {
  function handle() {
    const url = window.prompt("YouTube or Vimeo URL:");
    if (!url?.trim()) return;
    editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  }

  return (
    <ToolBtn onClick={handle} title="Embed YouTube / Vimeo video">
      <Video size={13} />
    </ToolBtn>
  );
}
