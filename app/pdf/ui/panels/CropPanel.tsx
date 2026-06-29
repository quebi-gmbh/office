/**
 * Crop selected pages (or all) by setting MediaBox + CropBox to a sub-rect.
 * Coordinates are PDF user-space points, origin bottom-left.
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { selectedSorted } from "~/pdf/lib/state";
import { cropPages } from "~/pdf/lib/crop";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function CropPanel({ doc, busy, onReplace, onToast }: Props) {
  const [x, setX] = useState<number>(0);
  const [y, setY] = useState<number>(0);
  const [w, setW] = useState<number>(595);
  const [h, setH] = useState<number>(842);

  const run = async () => {
    const sel = selectedSorted(doc);
    const targets = sel.length > 0 ? sel : Array.from({ length: doc.pageCount }, (_, i) => i);
    try {
      const out = await cropPages(doc.bytes, targets, { x, y, width: w, height: h });
      await onReplace(out);
      onToast(`Cropped ${targets.length} page${targets.length === 1 ? "" : "s"}`);
    } catch (e) {
      onToast(`Crop failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted">
        All values in points (72 = 1 inch). Origin is bottom-left.
        {selectedSorted(doc).length > 0
          ? ` Applies to ${selectedSorted(doc).length} selected page(s).`
          : " Applies to all pages."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">x</span>
          <input type="number" value={x} onChange={(e) => setX(Number(e.target.value))}
                 className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">y</span>
          <input type="number" value={y} onChange={(e) => setY(Number(e.target.value))}
                 className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">width</span>
          <input type="number" value={w} onChange={(e) => setW(Number(e.target.value))}
                 className="rounded border border-border bg-bg px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">height</span>
          <input type="number" value={h} onChange={(e) => setH(Number(e.target.value))}
                 className="rounded border border-border bg-bg px-2 py-1" />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Apply crop
      </button>
    </div>
  );
}
