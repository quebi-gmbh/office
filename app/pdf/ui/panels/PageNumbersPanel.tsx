/**
 * Add page numbers to selected (or all) pages.
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { selectedSorted } from "~/pdf/lib/state";
import { addPageNumbers } from "~/pdf/lib/page-numbers";
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

export function PageNumbersPanel({ doc, busy, onReplace, onToast }: Props) {
  const [format, setFormat] = useState<string>("Page {n} of {total}");
  const [fontSize, setFontSize] = useState<number>(10);
  const [color, setColor] = useState<string>("#333333");
  const [anchor, setAnchor] = useState<Anchor>("bottom");
  const [inset, setInset] = useState<number>(24);
  const [startAt, setStartAt] = useState<number>(1);

  const run = async () => {
    const sel = selectedSorted(doc);
    try {
      const out = await addPageNumbers(doc.bytes, {
        format,
        fontSize,
        color,
        anchor,
        inset,
        pages: sel.length > 0 ? sel : null,
        startAt,
        docName: doc.name,
      });
      await onReplace(out);
      onToast("Added page numbers");
    } catch (e) {
      onToast(`Failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Format ({"{n}"}, {"{total}"}, {"{name}"})</span>
        <input
          type="text"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Size: {fontSize}pt</span>
          <input type="range" min={6} max={36} value={fontSize}
                 onChange={(e) => setFontSize(Number(e.target.value))} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Inset: {inset}pt</span>
          <input type="range" min={0} max={72} value={inset}
                 onChange={(e) => setInset(Number(e.target.value))} className="accent-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Start at</span>
          <input
            type="number"
            min={1}
            value={startAt}
            onChange={(e) => setStartAt(Math.max(1, Number(e.target.value)))}
            className="w-24 rounded border border-border bg-bg px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Colour</span>
          <input type="color" value={color}
                 onChange={(e) => setColor(e.target.value)}
                 className="h-8 w-12 rounded border border-border bg-bg" />
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
        disabled={busy}
        onClick={run}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Add page numbers
      </button>
    </div>
  );
}
