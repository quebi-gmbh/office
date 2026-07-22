import { useState } from "react";
import { Dialog } from "./Dialog";
import {
  defaultFilename,
  downloadBlob,
  exportPngBlob,
  exportSvgBlob,
} from "~/vector/io/export";
import type { VectorScene } from "~/vector/lib/types";

export function ExportDialog({ scene, onClose }: { scene: VectorScene; onClose: () => void }) {
  const [format, setFormat] = useState<"svg" | "png">("svg");
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    try {
      if (format === "svg") {
        downloadBlob(exportSvgBlob(scene), defaultFilename("svg"));
      } else {
        const blob = await exportPngBlob(scene, scale);
        downloadBlob(blob, defaultFilename("png"));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Export" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {(["svg", "png"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex-1 rounded border px-3 py-2 text-sm uppercase ${
                format === f ? "border-accent bg-quebi-brand/15 text-accent" : "border-border text-muted hover:text-fg"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {format === "png" && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Scale
            <select
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="rounded border border-border bg-bg px-2 py-1 text-fg"
            >
              <option value={1}>1× ({scene.doc.width}×{scene.doc.height})</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
              <option value={4}>4×</option>
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={doExport}
            className="rounded bg-quebi-brand px-3 py-1.5 text-sm font-medium text-quebi-on-brand hover:bg-quebi-brand-hover disabled:opacity-50"
          >
            {busy ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
