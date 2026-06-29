/**
 * Page-level operations: rotate / delete / duplicate / insert blank /
 * extract selection / set page size.
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { selectedSorted } from "~/pdf/lib/state";
import {
  rotatePages, deletePages, duplicatePages, insertBlankPage,
  extractPages, setPageSize,
} from "~/pdf/lib/pages";
import { suffixedName, downloadBytes } from "~/pdf/io/save";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

const PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: "A4 portrait",  w: 595.28, h: 841.89 },
  { label: "A4 landscape", w: 841.89, h: 595.28 },
  { label: "Letter portrait",  w: 612, h: 792 },
  { label: "Letter landscape", w: 792, h: 612 },
];

export function PagesPanel({ doc, busy, onReplace, onToast }: Props) {
  const sel = selectedSorted(doc);
  const selOrAll = sel.length > 0 ? sel : doc.pageCount > 0 ? Array.from({ length: doc.pageCount }, (_, i) => i) : [];
  const [insertAt, setInsertAt] = useState<number>(doc.pageCount);
  const [preset, setPreset] = useState<number>(0);

  const op = async (fn: () => Promise<Uint8Array>, msg: string) => {
    try {
      const out = await fn();
      await onReplace(out);
      onToast(msg);
    } catch (e) {
      onToast(`Failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted">
          Rotate {sel.length > 0 ? `${sel.length} selected page${sel.length === 1 ? "" : "s"}` : "all pages"}
        </div>
        <div className="flex gap-2">
          <Btn disabled={busy} onClick={() => op(() => rotatePages(doc.bytes, selOrAll, -90), "Rotated ↺ 90°")}>↺ 90°</Btn>
          <Btn disabled={busy} onClick={() => op(() => rotatePages(doc.bytes, selOrAll, 180), "Rotated 180°")}>180°</Btn>
          <Btn disabled={busy} onClick={() => op(() => rotatePages(doc.bytes, selOrAll, 90), "Rotated ↻ 90°")}>↻ 90°</Btn>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted">Modify pages</div>
        <div className="flex flex-wrap gap-2">
          <Btn disabled={busy || sel.length === 0} onClick={() => op(() => deletePages(doc.bytes, sel), `Deleted ${sel.length} page${sel.length === 1 ? "" : "s"}`)}>
            Delete selection
          </Btn>
          <Btn disabled={busy || sel.length === 0} onClick={() => op(() => duplicatePages(doc.bytes, sel), `Duplicated ${sel.length} page${sel.length === 1 ? "" : "s"}`)}>
            Duplicate
          </Btn>
          <Btn
            disabled={busy || sel.length === 0}
            onClick={async () => {
              try {
                const out = await extractPages(doc.bytes, sel);
                downloadBytes(out, suffixedName(doc.name, `-pages-${sel[0]! + 1}-${sel[sel.length - 1]! + 1}`));
                onToast(`Extracted ${sel.length} page${sel.length === 1 ? "" : "s"}`);
              } catch (e) {
                onToast(`Failed: ${(e as Error).message}`, "error");
              }
            }}
          >
            Extract selection → new PDF
          </Btn>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted">Insert blank page</div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">At (0 = start, {doc.pageCount} = end)</span>
            <input
              type="number"
              min={0}
              max={doc.pageCount}
              value={insertAt}
              onChange={(e) => setInsertAt(Math.max(0, Math.min(doc.pageCount, Number(e.target.value))))}
              className="w-24 rounded border border-border bg-bg px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Size</span>
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
          <Btn
            disabled={busy}
            onClick={() => {
              const p = PRESETS[preset]!;
              op(() => insertBlankPage(doc.bytes, insertAt, p.w, p.h), `Inserted blank ${p.label} at ${insertAt}`);
            }}
          >
            Insert
          </Btn>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-muted">
          Set page size {sel.length > 0 ? `(${sel.length} selected)` : "(all pages)"}
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Btn
              key={p.label}
              disabled={busy}
              onClick={() => op(() => setPageSize(doc.bytes, selOrAll, p.w, p.h), `Set page size to ${p.label}`)}
            >
              {p.label}
            </Btn>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Only the page box changes — existing content is not rescaled.
        </p>
      </div>
    </div>
  );
}

function Btn({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-border bg-card px-3 py-1.5 text-sm transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
