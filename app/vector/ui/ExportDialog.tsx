import { useState } from "react";
import { Dialog } from "./Dialog";
import {
  defaultFilename,
  downloadBlob,
  exportPdfBlob,
  exportRasterBlob,
  exportSvgBlob,
  type RasterFormat,
} from "~/vector/io/export";
import type { VNode, VectorScene } from "~/vector/lib/types";

type Format = "svg" | "png" | "jpeg" | "webp" | "pdf";
const FORMATS: Format[] = ["svg", "png", "jpeg", "webp", "pdf"];
const MARGIN = 8;

export function ExportDialog({
  scene,
  selection,
  onClose,
}: {
  scene: VectorScene;
  selection: VNode[];
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("svg");
  const [scale, setScale] = useState(1);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const canCrop = selection.length > 0;
  const crop = selectionOnly && canCrop ? selection : undefined;
  const isRaster = format === "png" || format === "jpeg" || format === "webp";

  async function doExport() {
    setBusy(true);
    try {
      const ext = format;
      if (format === "svg") {
        downloadBlob(exportSvgBlob(scene, crop ? { crop, margin: MARGIN } : undefined), defaultFilename("svg"));
      } else if (format === "pdf") {
        downloadBlob(await exportPdfBlob(scene, { scale, crop, margin: MARGIN }), defaultFilename("pdf"));
      } else {
        const blob = await exportRasterBlob(scene, { scale, format: format as RasterFormat, crop, margin: MARGIN });
        downloadBlob(blob, defaultFilename(ext === "jpeg" ? "jpg" : ext));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Export" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-5 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`rounded border px-2 py-2 text-xs uppercase ${
                format === f ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-fg"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {(isRaster || format === "pdf") && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Scale / DPI
            <select
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="rounded border border-border bg-bg px-2 py-1 text-fg"
            >
              <option value={1}>1× (72 dpi)</option>
              <option value={2}>2× (144 dpi)</option>
              <option value={3}>3× (216 dpi)</option>
              <option value={4}>4× (288 dpi)</option>
            </select>
          </label>
        )}

        <label className={`flex items-center gap-2 text-sm ${canCrop ? "text-muted" : "text-muted/40"}`}>
          <input
            type="checkbox"
            disabled={!canCrop}
            checked={selectionOnly && canCrop}
            onChange={(e) => setSelectionOnly(e.target.checked)}
            className="accent-accent"
          />
          Export selection only{canCrop ? ` (${selection.length})` : ""}
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={doExport}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
