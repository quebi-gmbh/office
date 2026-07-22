import { useState } from "react";
import { Dialog } from "./Dialog";

const PRESETS: { label: string; w: number; h: number }[] = [
  { label: "1000 × 700", w: 1000, h: 700 },
  { label: "1920 × 1080", w: 1920, h: 1080 },
  { label: "1080 × 1080", w: 1080, h: 1080 },
  { label: "A4 (794 × 1123)", w: 794, h: 1123 },
];

export function NewDocDialog({
  onConfirm,
  onClose,
}: {
  onConfirm: (w: number, h: number, bg: string) => void;
  onClose: () => void;
}) {
  const [w, setW] = useState(1000);
  const [h, setH] = useState(700);
  const [transparent, setTransparent] = useState(false);
  const [bg, setBg] = useState("#ffffff");

  return (
    <Dialog title="New document" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setW(p.w);
                setH(p.h);
              }}
              className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            W
            <input
              type="number"
              min={1}
              value={w}
              onChange={(e) => setW(parseInt(e.target.value, 10) || 1)}
              className="w-24 rounded border border-border bg-bg px-2 py-1 text-fg"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            H
            <input
              type="number"
              min={1}
              value={h}
              onChange={(e) => setH(parseInt(e.target.value, 10) || 1)}
              className="w-24 rounded border border-border bg-bg px-2 py-1 text-fg"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="accent-accent" />
            Transparent
          </label>
          {!transparent && (
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" />
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(w, h, transparent ? "transparent" : bg)}
            className="rounded bg-quebi-brand px-3 py-1.5 text-sm font-medium text-quebi-on-brand hover:bg-quebi-brand-hover"
          >
            Create
          </button>
        </div>
      </div>
    </Dialog>
  );
}
