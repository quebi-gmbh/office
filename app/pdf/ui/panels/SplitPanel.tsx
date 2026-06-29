/**
 * Split a single PDF by ranges / every-N pages / one-per-page. Outputs
 * download separately (the browser will prompt once per file).
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { splitByRanges, splitEveryN, splitSingles, parseRanges } from "~/pdf/lib/split";
import { downloadBytes } from "~/pdf/io/save";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function SplitPanel({ doc, busy, onToast }: Props) {
  const [mode, setMode] = useState<"ranges" | "everyN" | "singles">("ranges");
  const [rangesInput, setRangesInput] = useState<string>("1-" + doc.pageCount);
  const [everyN, setEveryN] = useState<number>(1);

  const run = async () => {
    try {
      let results: { name: string; bytes: Uint8Array }[] = [];
      if (mode === "ranges") {
        const ranges = parseRanges(rangesInput, doc.pageCount);
        results = await splitByRanges(doc.bytes, doc.name, ranges);
      } else if (mode === "everyN") {
        results = await splitEveryN(doc.bytes, doc.name, Math.max(1, everyN));
      } else {
        results = await splitSingles(doc.bytes, doc.name);
      }
      // Stagger downloads slightly so the browser doesn't drop any.
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        await new Promise((resolve) => setTimeout(resolve, i * 80));
        downloadBytes(r.bytes, r.name);
      }
      onToast(`Split into ${results.length} file${results.length === 1 ? "" : "s"}`);
    } catch (e) {
      onToast(`Split failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "ranges"}
            onChange={() => setMode("ranges")}
            className="accent-accent"
          />
          <span>By ranges (1-based, e.g. <code className="rounded bg-card px-1 py-0.5 text-xs">1-3, 5, 7-9</code>)</span>
        </label>
        {mode === "ranges" && (
          <input
            type="text"
            value={rangesInput}
            onChange={(e) => setRangesInput(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1 font-mono text-sm"
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "everyN"}
            onChange={() => setMode("everyN")}
            className="accent-accent"
          />
          <span>Every N pages</span>
        </label>
        {mode === "everyN" && (
          <input
            type="number"
            min={1}
            max={doc.pageCount}
            value={everyN}
            onChange={(e) => setEveryN(Math.max(1, Number(e.target.value)))}
            className="w-24 rounded border border-border bg-bg px-2 py-1"
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "singles"}
            onChange={() => setMode("singles")}
            className="accent-accent"
          />
          <span>One PDF per page</span>
        </label>
      </div>

      <button
        type="button"
        disabled={busy || doc.pageCount === 0}
        onClick={run}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Split & download
      </button>
    </div>
  );
}
