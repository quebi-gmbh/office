/**
 * Extract text from the active doc (or selected pages) via pdfjs. The result
 * is shown inline so the user can copy/paste before downloading.
 */
import { useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { selectedSorted } from "~/pdf/lib/state";
import { extractAllText, joinPagesAsText } from "~/pdf/lib/extract-text";
import { downloadText } from "~/pdf/io/save";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function ExtractTextPanel({ doc, busy, onToast }: Props) {
  const [text, setText] = useState<string>("");
  const [working, setWorking] = useState(false);

  const run = async () => {
    setWorking(true);
    try {
      const sel = new Set(selectedSorted(doc).map((p) => p + 1));
      const all = await extractAllText(doc.bytes);
      const pages = sel.size > 0 ? all.filter((p) => sel.has(p.page)) : all;
      const joined = joinPagesAsText(pages);
      setText(joined);
      onToast(`Extracted ${pages.length} page${pages.length === 1 ? "" : "s"}`);
    } catch (e) {
      onToast(`Extract failed: ${(e as Error).message}`, "error");
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      onToast("Copied to clipboard");
    } catch {
      onToast("Clipboard unavailable", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || working}
          onClick={run}
          className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
        >
          {working ? "Extracting…" : "Extract"}
        </button>
        <button
          type="button"
          disabled={!text}
          onClick={copy}
          className="rounded border border-border bg-card px-3 py-1.5 hover:border-accent disabled:opacity-40"
        >
          Copy
        </button>
        <button
          type="button"
          disabled={!text}
          onClick={() => downloadText(text, doc.name.replace(/\.pdf$/i, "") + ".txt")}
          className="rounded border border-border bg-card px-3 py-1.5 hover:border-accent disabled:opacity-40"
        >
          Download .txt
        </button>
      </div>

      <textarea
        value={text}
        readOnly
        placeholder="Extracted text will appear here…"
        className="h-72 w-full resize-y rounded border border-border bg-bg p-2 font-mono text-xs"
      />
    </div>
  );
}
