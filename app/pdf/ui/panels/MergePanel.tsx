/**
 * Merge multiple open docs into one new PDF.
 */
import { useEffect, useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { mergePdfs } from "~/pdf/lib/merge";
import { downloadBytes } from "~/pdf/io/save";

type Props = {
  docs: OpenDoc[];
  busy: boolean;
  onAddOpened: (bytes: Uint8Array, name: string) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function MergePanel({ docs, busy, onAddOpened, onToast }: Props) {
  const [order, setOrder] = useState<string[]>(() => docs.map((d) => d.id));

  // Keep the order list in sync with the open-doc set.
  useEffect(() => {
    setOrder((prev) => {
      const ids = new Set(docs.map((d) => d.id));
      const kept = prev.filter((id) => ids.has(id));
      for (const d of docs) if (!kept.includes(d.id)) kept.push(d.id);
      return kept;
    });
  }, [docs]);

  const move = (idx: number, delta: number) => {
    setOrder((cur) => {
      const next = [...cur];
      const swap = idx + delta;
      if (swap < 0 || swap >= next.length) return cur;
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return next;
    });
  };

  const run = async (download: boolean) => {
    const lookup = new Map(docs.map((d) => [d.id, d]));
    const inputs = order
      .map((id) => lookup.get(id))
      .filter((d): d is OpenDoc => !!d)
      .map((d) => ({ bytes: d.bytes }));
    if (inputs.length < 2) {
      onToast("Open at least two PDFs to merge.", "error");
      return;
    }
    try {
      const out = await mergePdfs(inputs);
      if (download) downloadBytes(out, "merged.pdf");
      else await onAddOpened(out, "merged.pdf");
      onToast(`Merged ${inputs.length} PDFs`);
    } catch (e) {
      onToast(`Merge failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {docs.length < 2 ? (
        <p className="text-muted">Open at least two PDFs to merge.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Order top-to-bottom = final document order.
          </p>
          <ol className="flex flex-col gap-1">
            {order.map((id, idx) => {
              const d = docs.find((x) => x.id === id);
              if (!d) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5"
                >
                  <span className="font-mono text-xs text-muted">{idx + 1}.</span>
                  <span className="flex-1 truncate" title={d.name}>{d.name}</span>
                  <span className="text-xs text-muted">{d.pageCount}p</span>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                    className="rounded px-1 text-muted hover:text-fg disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx === order.length - 1}
                    onClick={() => move(idx, 1)}
                    className="rounded px-1 text-muted hover:text-fg disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(false)}
              className="rounded border border-border bg-card px-3 py-1.5 hover:border-accent disabled:opacity-40"
            >
              Merge → open
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(true)}
              className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
            >
              Merge → download
            </button>
          </div>
        </>
      )}
    </div>
  );
}
