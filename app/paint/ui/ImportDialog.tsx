/**
 * Import placement dialog — shown when an image is dropped, pasted, or file-picked.
 * Options: Fit (scale to fit doc), Centre (original size centred), Replace canvas (resize doc).
 * Remembers the last choice in localStorage.
 */
import { useState, useRef, useEffect } from "react";
import type { PlacementMode } from "~/paint/io/import";

const PLACEMENT_KEY = "office:paint:last-placement";

function loadLastPlacement(): PlacementMode {
  try {
    const v = localStorage.getItem(PLACEMENT_KEY) as PlacementMode | null;
    if (v === "fit" || v === "centre" || v === "replace") return v;
  } catch {}
  return "fit";
}

function saveLastPlacement(mode: PlacementMode): void {
  try { localStorage.setItem(PLACEMENT_KEY, mode); } catch {}
}

interface ImportDialogProps {
  bitmap: ImageBitmap;
  onConfirm(mode: PlacementMode): void;
  onClose(): void;
}

export function ImportDialog({ bitmap, onConfirm, onClose }: ImportDialogProps) {
  const [mode, setMode] = useState<PlacementMode>(loadLastPlacement());
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
    saveLastPlacement(mode);
    onConfirm(mode);
  }

  return (
    <dialog ref={dialogRef} className="paint-modal" onClick={(e) => {
      if (e.target === dialogRef.current) onClose();
    }}>
      <div className="paint-modal__content" style={{ minWidth: 300 }}>
        <div className="paint-modal__header">
          <h2 className="paint-modal__title">Place imported image</h2>
          <button type="button" className="paint-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="paint-modal__body" style={{ flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
            Image size: {bitmap.width} × {bitmap.height}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {(["fit", "centre", "replace"] as PlacementMode[]).map((m) => (
              <label key={m} className="paint-toolbar__label" style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="placement"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span>
                  {m === "fit" && "Fit — scale to fit canvas"}
                  {m === "centre" && "Centre — original size, centred (may clip)"}
                  {m === "replace" && "Replace canvas — resize canvas to image"}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="paint-toolbar__btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="paint-toolbar__btn"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              onClick={confirm}
            >
              Place
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
