/**
 * Export dialog — PNG / JPEG / WebP with quality slider, filename, copy-to-clipboard.
 * Ctrl+S opens this; Ctrl+Shift+S quick-saves with last-used settings (handled in shortcuts).
 */
import { useState, useRef, useEffect } from "react";
import type { ExportFormat } from "~/paint/io/export";
import { canvasToBlob, downloadBlob, defaultFilename, copyToClipboard } from "~/paint/io/export";

const FORMAT_KEY = "office:paint:last-export-format";
const QUALITY_KEY = "office:paint:last-export-quality";

function loadPrefs(): { format: ExportFormat; quality: number } {
  try {
    const f = localStorage.getItem(FORMAT_KEY) as ExportFormat | null;
    const q = Number(localStorage.getItem(QUALITY_KEY) ?? "0.92");
    return {
      format: (f === "image/jpeg" || f === "image/webp") ? f : "image/png",
      quality: isNaN(q) ? 0.92 : q,
    };
  } catch {
    return { format: "image/png", quality: 0.92 };
  }
}

function savePrefs(format: ExportFormat, quality: number): void {
  try {
    localStorage.setItem(FORMAT_KEY, format);
    localStorage.setItem(QUALITY_KEY, String(quality));
  } catch {}
}

interface ExportDialogProps {
  canvas: HTMLCanvasElement;
  onClose(): void;
}

export function ExportDialog({ canvas, onClose }: ExportDialogProps) {
  const prefs = loadPrefs();
  const [format, setFormat] = useState<ExportFormat>(prefs.format);
  const [quality, setQuality] = useState(prefs.quality);
  const [filename, setFilename] = useState(() => defaultFilename(prefs.format));
  const [copying, setCopying] = useState(false);
  const [copyOk, setCopyOk] = useState<boolean | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.showModal();
      const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
      dialog.addEventListener("cancel", onCancel);
      return () => dialog.removeEventListener("cancel", onCancel);
    }
  }, [onClose]);

  function updateFormat(f: ExportFormat) {
    setFormat(f);
    setFilename(defaultFilename(f));
  }

  async function doExport() {
    savePrefs(format, quality);
    const blob = await canvasToBlob(canvas, format, quality);
    downloadBlob(blob, filename || defaultFilename(format));
    onClose();
  }

  async function doCopy() {
    setCopying(true);
    const ok = await copyToClipboard(canvas);
    setCopying(false);
    setCopyOk(ok);
    if (ok) setTimeout(onClose, 800);
  }

  const needsQuality = format !== "image/png";

  return (
    <dialog ref={dialogRef} className="paint-modal" onClick={(e) => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <div className="paint-modal__content" style={{ minWidth: 320 }}>
        <div className="paint-modal__header">
          <h2 className="paint-modal__title">Export image</h2>
          <button type="button" className="paint-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="paint-modal__body" style={{ flexDirection: "column", gap: "0.75rem" }}>
          {/* Format */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["image/png", "image/jpeg", "image/webp"] as ExportFormat[]).map((f) => (
              <label key={f} className="paint-toolbar__label" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => updateFormat(f)}
                />
                <span>{f.split("/")[1].toUpperCase()}</span>
              </label>
            ))}
          </div>

          {/* Quality */}
          {needsQuality && (
            <label className="paint-toolbar__label">
              <span>Quality</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="paint-toolbar__range"
              />
              <span className="paint-toolbar__value">{Math.round(quality * 100)}%</span>
            </label>
          )}

          {/* Filename */}
          <label className="paint-modal__field">
            <span className="paint-modal__field-label">Filename</span>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="paint-modal__input"
              style={{ width: "100%" }}
            />
          </label>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
            <button type="button" className="paint-toolbar__btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="paint-toolbar__btn"
              onClick={doCopy}
              disabled={copying}
              title="Copy PNG to clipboard"
            >
              {copyOk === true ? "✓ Copied!" : copyOk === false ? "Copy failed" : copying ? "Copying…" : "Copy"}
            </button>
            <button
              type="button"
              className="paint-toolbar__btn"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              onClick={doExport}
            >
              ↓ Download
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
