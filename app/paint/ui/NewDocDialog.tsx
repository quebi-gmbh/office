/**
 * New document dialog.
 * Lets the user choose width, height, and background colour (or transparent).
 * Warns for very large documents (> 2048 in either dimension).
 */
import { useState, useRef, useEffect } from "react";

interface NewDocDialogProps {
  onConfirm(width: number, height: number, bg: string): void;
  onClose(): void;
}

const PRESETS = [
  { label: "720p",           width: 1280, height: 720 },
  { label: "1080p",          width: 1920, height: 1080 },
  { label: "Square 1024",    width: 1024, height: 1024 },
  { label: "Square 512",     width: 512,  height: 512  },
  { label: "Instagram post", width: 1080, height: 1080 },
  { label: "A4 @ 300dpi",    width: 3508, height: 2480 },
];

export function NewDocDialog({ onConfirm, onClose }: NewDocDialogProps) {
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [bg, setBg] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
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

  function confirm() {
    onConfirm(width, height, transparent ? "transparent" : bg);
  }

  const large = width > 2048 || height > 2048;

  return (
    <dialog ref={dialogRef} className="paint-modal" onClick={(e) => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <div className="paint-modal__content" style={{ minWidth: 320 }}>
        <div className="paint-modal__header">
          <h2 className="paint-modal__title">New document</h2>
          <button type="button" className="paint-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="paint-modal__body" style={{ flexDirection: "column", gap: "0.75rem" }}>
          {/* Presets */}
          <div>
            <label className="paint-toolbar__label" style={{ marginBottom: "0.4rem" }}>
              <span style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>Preset</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="paint-toolbar__btn"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => { setWidth(p.width); setHeight(p.height); }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <label className="paint-modal__field">
              <span className="paint-modal__field-label">Width</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={width}
                onChange={(e) => setWidth(Math.max(1, Number(e.target.value)))}
                className="paint-modal__input"
              />
            </label>
            <span style={{ color: "var(--color-muted)" }}>×</span>
            <label className="paint-modal__field">
              <span className="paint-modal__field-label">Height</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={height}
                onChange={(e) => setHeight(Math.max(1, Number(e.target.value)))}
                className="paint-modal__input"
              />
            </label>
          </div>

          {large && (
            <p style={{ color: "var(--color-muted)", fontSize: "0.8rem", margin: 0 }}>
              ⚠ Large canvases use significant memory. Undo history will be limited.
            </p>
          )}

          {/* Background */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <label className="paint-toolbar__label">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              <span>Transparent background</span>
            </label>
            {!transparent && (
              <label className="paint-toolbar__colour-label">
                <span className="paint-toolbar__colour-name">BG</span>
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="paint-toolbar__colour-input"
                />
              </label>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="paint-toolbar__btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="paint-toolbar__btn"
              style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
              onClick={confirm}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
