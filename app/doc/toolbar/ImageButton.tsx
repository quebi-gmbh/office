/**
 * Image insert button.
 *
 * Opens a file picker, reads the selected image as a base64 data URL,
 * prompts for optional alt text, then inserts an <img> node via TipTap's
 * Image extension.
 *
 * Images are stored inline as base64 in the document (no backend).
 */
import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import { ImageIcon } from "lucide-react";
import { ToolBtn } from "../Toolbar";

interface ImageButtonProps {
  editor: Editor;
}

export function ImageButton({ editor }: ImageButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const alt = window.prompt("Alt text (optional):", file.name) ?? "";
        editor.chain().focus().setImage({ src, alt }).run();
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <>
      <ToolBtn
        onClick={() => inputRef.current?.click()}
        title="Insert image"
      >
        <ImageIcon size={13} />
      </ToolBtn>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        // Reset so re-selecting the same file fires onChange again
        onClick={(e) => ((e.target as HTMLInputElement).value = "")}
      />
    </>
  );
}
