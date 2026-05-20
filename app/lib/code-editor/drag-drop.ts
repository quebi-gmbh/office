/**
 * Drag-and-drop file handling for the code editor container.
 * Returns React event handlers to spread onto the editor wrapper div.
 */
import type { Lang } from "./languages";
import { langFromFilename } from "./languages";

type DropResult = {
  name: string;
  text: string;
  lang: Lang;
};

type DragDropHandlers = {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
};

export function useDragDrop(
  onFile: (result: DropResult) => void,
  onDirtyCheck: () => boolean,
): DragDropHandlers & { isDragging: boolean } {
  // Note: isDragging state is managed by the caller via React state;
  // we keep it simple here and just return the event handlers.
  // The caller pattern:
  //   const [isDragging, setDragging] = useState(false);
  //   const dnd = useDragDrop(...); → spread dnd.handlers, use dnd.isDragging

  return {
    isDragging: false, // managed externally by caller
    onDragOver(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();
    },
    async onDrop(e: React.DragEvent) {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files[0];
      if (!file) return;

      // Confirm before overwriting dirty buffer
      if (onDirtyCheck() && !window.confirm("Discard current changes?")) return;

      const text = await file.text();
      onFile({ name: file.name, text, lang: langFromFilename(file.name) });
    },
  };
}
