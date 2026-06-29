/**
 * Stamp an image (PNG/JPG) onto selected pages.
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { selectedSorted } from "~/pdf/lib/state";
import { pickImageFiles } from "~/pdf/io/load";
import { stampImage } from "~/pdf/lib/image-stamp";
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

export function ImageStampPanel({ doc, busy, onReplace, onToast }: Props) {
  const [img, setImg] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [width, setWidth] = useState<number>(180);
  const [opacity, setOpacity] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [anchor, setAnchor] = useState<Anchor>("bottom-right");
  const [inset, setInset] = useState<number>(24);

  const pick = async () => {
    const files = await pickImageFiles();
    if (files.length > 0) setImg(files[0]!);
  };

  const run = async () => {
    if (!img) return;
    const sel = selectedSorted(doc);
    try {
      const out = await stampImage(doc.bytes, {
        imageBytes: img.bytes,
        width,
        opacity,
        rotation,
        anchor,
        inset,
        pages: sel.length > 0 ? sel : null,
      });
      await onReplace(out);
      onToast(`Stamped image on ${sel.length > 0 ? sel.length : "all"} page${sel.length === 1 ? "" : "s"}`);
    } catch (e) {
      onToast(`Stamp failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={pick}
          className="rounded border border-border bg-card px-3 py-1.5 hover:border-accent"
        >
          Choose image…
        </button>
        {img && <span className="truncate text-xs text-muted" title={img.name}>{img.name}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Width: {width}pt</span>
          <input type="range" min={20} max={500} value={width}
                 onChange={(e) => setWidth(Number(e.target.value))} className="accent-accent" />
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

      <label className="flex flex-col gap-1">
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

      <button
        type="button"
        disabled={busy || !img}
        onClick={run}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Stamp image
      </button>
    </div>
  );
}
