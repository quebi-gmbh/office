/**
 * DrawPanel — options for the active annotation tool plus the signature
 * manager. Rendered as the side panel of the Draw workspace (see
 * `AnnotateWorkspace`); the tool picker itself lives in that workspace's
 * toolbar.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AnnotTool } from "~/pdf/lib/annotate";
import type { DrawStyle } from "~/pdf/ui/AnnotateCanvas";
import { SignaturePad, SignaturePreview } from "~/pdf/ui/SignaturePad";
import {
  deleteSignature, saveSignature, type StoredSignature,
} from "~/pdf/lib/signatures";

const SWATCHES = [
  "#111827", "#1d4ed8", "#dc2626", "#16a34a",
  "#f59e0b", "#7c3aed", "#0f9d75", "#ffffff",
];

/** Marker inks — also used to decide when to swap the colour on tool change. */
export const HIGHLIGHTS = ["#fde047", "#86efac", "#93c5fd", "#fca5a5"];

type Props = {
  tool: AnnotTool;
  style: DrawStyle;
  onStyle: (patch: Partial<DrawStyle>) => void;
  signatures: StoredSignature[];
  onSignatures: (list: StoredSignature[]) => void;
  activeSignatureId: string | null;
  onPickSignature: (id: string | null) => void;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function DrawPanel({
  tool, style, onStyle, signatures, onSignatures,
  activeSignatureId, onPickSignature, onToast,
}: Props) {
  const [capturing, setCapturing] = useState(false);

  const isShape = tool === "line" || tool === "arrow" || tool === "rect" || tool === "ellipse";
  const isInk = tool === "pen" || tool === "highlighter";
  const palette = tool === "highlighter" ? [...HIGHLIGHTS, ...SWATCHES.slice(0, 4)] : SWATCHES;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {tool !== "eraser" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Colour</span>
          <div className="grid grid-cols-8 gap-1">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onStyle({ color: c })}
                aria-label={`Colour ${c}`}
                title={c}
                className={`h-6 w-full rounded border ${
                  style.color.toLowerCase() === c.toLowerCase()
                    ? "border-accent ring-2 ring-accent/40"
                    : "border-border"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <input
            type="color"
            value={style.color}
            onChange={(e) => onStyle({ color: e.target.value })}
            aria-label="Custom colour"
            className="mt-1 h-7 w-full cursor-pointer rounded border border-border bg-card"
          />
        </div>
      )}

      {(isInk || isShape) && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">
            {tool === "highlighter" ? "Marker" : "Width"}: {style.width}pt
          </span>
          <input type="range" min={0.5} max={tool === "highlighter" ? 40 : 20} step={0.5}
                 value={style.width}
                 onChange={(e) => onStyle({ width: Number(e.target.value) })}
                 className="accent-accent" />
        </label>
      )}

      {tool === "text" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Font size: {style.textSize}pt</span>
          <input type="range" min={6} max={72} step={1} value={style.textSize}
                 onChange={(e) => onStyle({ textSize: Number(e.target.value) })}
                 className="accent-accent" />
        </label>
      )}

      {tool === "eraser" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Eraser size: {style.eraserSize}pt</span>
          <input type="range" min={2} max={40} step={1} value={style.eraserSize}
                 onChange={(e) => onStyle({ eraserSize: Number(e.target.value) })}
                 className="accent-accent" />
          <span className="text-xs text-muted">
            Erasing removes whole strokes, not pixels.
          </span>
        </label>
      )}

      {tool !== "eraser" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Opacity: {Math.round(style.opacity * 100)}%</span>
          <input type="range" min={0.05} max={1} step={0.05} value={style.opacity}
                 onChange={(e) => onStyle({ opacity: Number(e.target.value) })}
                 className="accent-accent" />
        </label>
      )}

      {(tool === "rect" || tool === "ellipse") && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Fill</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onStyle({ fill: style.fill ? null : "#fde047" })}
              className={`rounded border px-2 py-1 text-xs ${
                style.fill ? "border-accent bg-accent/15 text-accent" : "border-border bg-card"
              }`}
            >
              {style.fill ? "Filled" : "Outline only"}
            </button>
            {style.fill && (
              <input
                type="color"
                value={style.fill}
                onChange={(e) => onStyle({ fill: e.target.value })}
                aria-label="Fill colour"
                className="h-7 w-16 cursor-pointer rounded border border-border bg-card"
              />
            )}
          </div>
        </div>
      )}

      {/* ── Signatures ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted">Signatures</span>
          <button
            type="button"
            onClick={() => setCapturing(true)}
            className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs hover:border-accent"
          >
            <Plus size={12} aria-hidden /> New
          </button>
        </div>

        {signatures.length === 0 ? (
          <p className="text-xs text-muted">
            Draw a signature once — it's saved in this browser and can be stamped on
            any page.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {signatures.map((s) => (
              <li
                key={s.id}
                className={`flex items-center gap-2 rounded border px-2 py-1 ${
                  activeSignatureId === s.id
                    ? "border-accent bg-accent/10"
                    : "border-border bg-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPickSignature(activeSignatureId === s.id ? null : s.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title="Use this signature (pick the Signature tool, then click the page)"
                >
                  <SignaturePreview paths={s.paths} aspect={s.aspect} width={72} />
                  <span className="truncate text-xs">{s.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSignatures(deleteSignature(s.id));
                    if (activeSignatureId === s.id) onPickSignature(null);
                  }}
                  aria-label={`Delete ${s.name}`}
                  className="rounded p-1 text-muted hover:bg-bg hover:text-fg"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {tool === "signature" && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Stamp width: {style.signatureWidth}pt</span>
            <input type="range" min={40} max={400} step={5} value={style.signatureWidth}
                   onChange={(e) => onStyle({ signatureWidth: Number(e.target.value) })}
                   className="accent-accent" />
            <span className="text-xs text-muted">
              Click to stamp at this width, or drag to size it.
            </span>
          </label>
        )}
      </div>

      {capturing && (
        <SignaturePad
          onCancel={() => setCapturing(false)}
          onSave={(sig) => {
            const list = saveSignature(sig);
            onSignatures(list);
            onPickSignature(list[0]?.id ?? null);
            setCapturing(false);
            onToast(`Saved signature “${sig.name}”`);
          }}
        />
      )}
    </div>
  );
}
