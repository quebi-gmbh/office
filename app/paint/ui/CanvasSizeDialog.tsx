/**
 * Canvas size dialog — shared between "Resize canvas" and "Scale image".
 *
 * Resize: no pixel scaling; 9-point anchor controls where existing content lands.
 * Scale:  resamples artwork to new dimensions; optional aspect-ratio lock.
 *
 * Modelled on NewDocDialog.tsx.
 */
import { useState, useRef, useEffect } from "react";
import type { Engine } from "~/paint/engine";
import type { AnchorPoint, EngineState } from "~/paint/lib/types";

interface CanvasSizeDialogProps {
  mode: "resize" | "scale";
  engine: Engine;
  state: EngineState;
  onClose(): void;
}

const ANCHOR_POINTS: AnchorPoint[] = [
  "top-left",    "top",    "top-right",
  "left",        "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

export function CanvasSizeDialog({ mode, engine, state, onClose }: CanvasSizeDialogProps) {
  const { width: docW, height: docH } = state.doc;
  const [width, setWidth] = useState(docW);
  const [height, setHeight] = useState(docH);
  const [lockAspect, setLockAspect] = useState(true);
  const [anchor, setAnchor] = useState<AnchorPoint>("center");
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Original aspect ratio at the time the dialog opened.
  const origAspect = docW / docH;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  function handleWidthChange(w: number) {
    const clamped = Math.max(1, Math.min(8192, w));
    setWidth(clamped);
    if (mode === "scale" && lockAspect) {
      setHeight(Math.max(1, Math.min(8192, Math.round(clamped / origAspect))));
    }
  }

  function handleHeightChange(h: number) {
    const clamped = Math.max(1, Math.min(8192, h));
    setHeight(clamped);
    if (mode === "scale" && lockAspect) {
      setWidth(Math.max(1, Math.min(8192, Math.round(clamped * origAspect))));
    }
  }

  function confirm() {
    const w = Math.max(1, Math.min(8192, width));
    const h = Math.max(1, Math.min(8192, height));
    if (mode === "resize") {
      engine.resizeCanvas(w, h, anchor);
    } else {
      engine.scaleImage(w, h);
    }
    engine.fitViewport?.();
    onClose();
  }

  const isLarge = width > 2048 || height > 2048;

  return (
    <dialog
      ref={dialogRef}
      className="paint-modal"
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
    >
      <div className="paint-modal__content" style={{ minWidth: 320 }}>
        <div className="paint-modal__header">
          <h2 className="paint-modal__title">
            {mode === "resize" ? "Resize canvas" : "Scale image"}
          </h2>
          <button type="button" className="paint-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="paint-modal__body" style={{ flexDirection: "column", gap: "0.75rem" }}>

          {/* Dimensions */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <label className="paint-modal__field">
              <span className="paint-modal__field-label">Width</span>
              <input
                type="number"
                min={1}
                max={8192}
                value={width}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
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
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="paint-modal__input"
              />
            </label>
          </div>

          {isLarge && (
            <p style={{ color: "var(--color-muted)", fontSize: "0.8rem", margin: 0 }}>
              ⚠ Large canvases use significant memory. Undo history will be limited.
            </p>
          )}

          {/* Aspect lock — scale mode only */}
          {mode === "scale" && (
            <label className="paint-toolbar__label">
              <input
                type="checkbox"
                checked={lockAspect}
                onChange={(e) => setLockAspect(e.target.checked)}
              />
              <span>Lock aspect ratio</span>
            </label>
          )}

          {/* 9-point anchor picker — resize mode only */}
          {mode === "resize" && (
            <div>
              <div style={{ color: "var(--color-muted)", fontSize: "0.8rem", marginBottom: "0.4rem" }}>
                Anchor (where existing pixels land)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 2.2rem)", gap: "0.2rem" }}>
                {ANCHOR_POINTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAnchor(a)}
                    aria-label={a}
                    title={a}
                    style={{
                      width: "2.2rem",
                      height: "2.2rem",
                      border: anchor === a
                        ? "2px solid var(--color-accent)"
                        : "1px solid var(--color-border)",
                      borderRadius: "4px",
                      background: anchor === a ? "var(--color-accent)" : "var(--color-card)",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

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
              {mode === "resize" ? "Resize" : "Scale"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
