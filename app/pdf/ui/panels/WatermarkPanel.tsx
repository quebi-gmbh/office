/**
 * Stamp a text watermark across selected (or all) pages.
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { selectedSorted } from "~/pdf/lib/state";
import { addTextWatermark } from "~/pdf/lib/watermark";
import type { Anchor } from "~/pdf/lib/watermark";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

const ANCHORS: Anchor[] = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

export function WatermarkPanel({ doc, busy, onReplace, onToast }: Props) {
  const [text, setText] = useState<string>("DRAFT");
  const [fontSize, setFontSize] = useState<number>(72);
  const [opacity, setOpacity] = useState<number>(0.2);
  const [rotation, setRotation] = useState<number>(45);
  const [color, setColor] = useState<string>("#888888");
  const [anchor, setAnchor] = useState<Anchor>("center");
  const [inset, setInset] = useState<number>(36);

  const run = async () => {
    const sel = selectedSorted(doc);
    try {
      const out = await addTextWatermark(doc.bytes, {
        text,
        fontSize,
        opacity,
        rotation,
        color,
        anchor,
        inset,
        pages: sel.length > 0 ? sel : null,
      });
      await onReplace(out);
      onToast(sel.length > 0 ? `Stamped ${sel.length} page${sel.length === 1 ? "" : "s"}` : "Stamped all pages");
    } catch (e) {
      onToast(`Watermark failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Text</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Font size: {fontSize}pt</span>
          <input type="range" min={8} max={200} value={fontSize}
                 onChange={(e) => setFontSize(Number(e.target.value))} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Opacity: {Math.round(opacity * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={opacity}
                 onChange={(e) => setOpacity(Number(e.target.value))} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Rotation: {rotation}°</span>
          <input type="range" min={-180} max={180} value={rotation}
                 onChange={(e) => setRotation(Number(e.target.value))} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Inset: {inset}pt</span>
          <input type="range" min={0} max={144} value={inset}
                 onChange={(e) => setInset(Number(e.target.value))} className="accent-accent" />
        </label>
      </div>

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Colour</span>
          <input type="color" value={color}
                 onChange={(e) => setColor(e.target.value)}
                 className="h-8 w-12 rounded border border-border bg-bg" />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted">Position</span>
          <div className="grid grid-cols-3 gap-1">
            {ANCHORS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAnchor(a)}
                className={`rounded border px-2 py-1 text-xs ${
                  anchor === a
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                {a.replace("-", " ")}
              </button>
            ))}
          </div>
        </label>
      </div>

      <button
        type="button"
        disabled={busy || !text}
        onClick={run}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Stamp watermark
      </button>
    </div>
  );
}
