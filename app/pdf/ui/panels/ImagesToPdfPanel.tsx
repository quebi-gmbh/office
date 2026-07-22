/**
 * Build a brand-new PDF from images. Doesn't need an OpenDoc — operates on
 * its own staged image list.
 */
import { useState } from "react";
import { pickImageFiles } from "~/pdf/io/load";
import {
  imagesToPdf,
  PAPER_A4, PAPER_LETTER,
  type PaperSize,
} from "~/pdf/lib/images-to-pdf";

type Props = {
  busy: boolean;
  onAddOpened: (bytes: Uint8Array, name: string) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

type Staged = { id: string; name: string; bytes: Uint8Array };

const PRESETS: Array<{ label: string; value: PaperSize | null }> = [
  { label: "Native (1px = 1pt)", value: null },
  { label: "A4 portrait", value: PAPER_A4 },
  { label: "A4 landscape", value: { width: PAPER_A4.height, height: PAPER_A4.width } },
  { label: "Letter portrait", value: PAPER_LETTER },
  { label: "Letter landscape", value: { width: PAPER_LETTER.height, height: PAPER_LETTER.width } },
];

export function ImagesToPdfPanel({ busy, onAddOpened, onToast }: Props) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [preset, setPreset] = useState<number>(1);
  const [margin, setMargin] = useState<number>(24);

  const addImages = async () => {
    const files = await pickImageFiles();
    setStaged((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: Math.random().toString(36).slice(2, 8),
        name: f.name,
        bytes: f.bytes,
      })),
    ]);
  };

  const remove = (id: string) => setStaged((prev) => prev.filter((s) => s.id !== id));
  const move = (id: string, delta: number) => {
    setStaged((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const swap = idx + delta;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return next;
    });
  };

  const run = async () => {
    if (staged.length === 0) return;
    try {
      const bytes = await imagesToPdf(
        staged.map((s) => ({ name: s.name, bytes: s.bytes })),
        { pageSize: PRESETS[preset]!.value, margin: PRESETS[preset]!.value ? margin : 0 },
      );
      await onAddOpened(bytes, "images.pdf");
      onToast(`Built PDF from ${staged.length} image${staged.length === 1 ? "" : "s"}`);
    } catch (e) {
      onToast(`Failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <button
        type="button"
        onClick={addImages}
        className="self-start rounded border border-border bg-card px-3 py-1.5 hover:border-accent"
      >
        + Add images (PNG/JPG)
      </button>

      {staged.length > 0 && (
        <ol className="flex flex-col gap-1">
          {staged.map((s, idx) => (
            <li key={s.id} className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5">
              <span className="font-mono text-xs text-muted">{idx + 1}.</span>
              <span className="flex-1 truncate" title={s.name}>{s.name}</span>
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => move(s.id, -1)}
                className="rounded px-1 text-muted hover:text-fg disabled:opacity-30"
                aria-label="Move up"
              >↑</button>
              <button
                type="button"
                disabled={idx === staged.length - 1}
                onClick={() => move(s.id, 1)}
                className="rounded px-1 text-muted hover:text-fg disabled:opacity-30"
                aria-label="Move down"
              >↓</button>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="rounded px-1 text-muted hover:text-red-600"
                aria-label="Remove"
              >✕</button>
            </li>
          ))}
        </ol>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Page size</span>
          <select
            value={preset}
            onChange={(e) => setPreset(Number(e.target.value))}
            className="rounded border border-border bg-bg px-2 py-1"
          >
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </select>
        </label>
        {PRESETS[preset]!.value && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Margin: {margin}pt</span>
            <input
              type="range"
              min={0}
              max={72}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="accent-accent"
            />
          </label>
        )}
      </div>

      <button
        type="button"
        disabled={busy || staged.length === 0}
        onClick={run}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Build PDF
      </button>
    </div>
  );
}
