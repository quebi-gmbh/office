/**
 * Grid of page thumbnails for an OpenDoc. Handles single-click toggle,
 * Ctrl/Cmd-click toggle, and Shift-click range select.
 */
import { useCallback, useRef } from "react";
import { PageThumb } from "~/pdf/ui/PageThumb";
import type { OpenDoc } from "~/pdf/lib/state";

type Props = {
  doc: OpenDoc;
  thumbWidth: number;
  onSelectionChange: (selected: Set<number>) => void;
};

export function ThumbnailGrid({ doc, thumbWidth, onSelectionChange }: Props) {
  const lastClickedRef = useRef<number | null>(null);

  const handleToggle = useCallback(
    (page: number, modKey: boolean, shiftKey: boolean) => {
      const next = new Set(doc.selected);
      if (shiftKey && lastClickedRef.current !== null) {
        const lo = Math.min(lastClickedRef.current, page);
        const hi = Math.max(lastClickedRef.current, page);
        for (let p = lo; p <= hi; p++) next.add(p);
      } else if (modKey) {
        if (next.has(page)) next.delete(page);
        else next.add(page);
      } else {
        // Plain click — toggle a single page (also clears range)
        if (next.has(page) && next.size === 1) next.delete(page);
        else {
          next.clear();
          next.add(page);
        }
      }
      lastClickedRef.current = page;
      onSelectionChange(next);
    },
    [doc.selected, onSelectionChange],
  );

  const pages: number[] = [];
  for (let i = 0; i < doc.pageCount; i++) pages.push(i);

  return (
    <div className="flex flex-wrap gap-2">
      {pages.map((p) => (
        <PageThumb
          key={p}
          docId={doc.id}
          rev={doc.rev}
          bytes={doc.bytes}
          page={p}
          width={thumbWidth}
          selected={doc.selected.has(p)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
