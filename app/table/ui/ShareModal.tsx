/**
 * Share modal: copy a share-by-URL link, load a table from a URL, open the
 * active sheet in /code, and export the grid as PNG.
 */
import { useState } from "react";

interface ShareModalProps {
  onClose: () => void;
  onCopyLink: () => void;
  onLoadUrl: (url: string) => void;
  onOpenInCode: (format: "csv" | "json" | "python") => void;
  onExportPng: () => void;
}

export function ShareModal({ onClose, onCopyLink, onLoadUrl, onOpenInCode, onExportPng }: ShareModalProps) {
  const [url, setUrl] = useState("");
  const btn = "rounded border border-border bg-card px-2 py-1 text-xs hover:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-bg p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-semibold">Share & exchange</h2>

        <section className="mb-4">
          <p className="mb-1 text-xs text-muted">Share by URL</p>
          <button type="button" onClick={onCopyLink} className="rounded border border-accent bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30">
            Copy share link
          </button>
          <p className="mt-1 text-[11px] text-muted">The whole workbook is compressed into the link (best for small docs).</p>
        </section>

        <section className="mb-4">
          <p className="mb-1 text-xs text-muted">Load from URL</p>
          <div className="flex gap-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) onLoadUrl(url.trim()); }}
              placeholder="https://example.com/data.csv"
              className="h-7 flex-1 rounded border border-border bg-card px-2 text-xs outline-none focus:border-accent"
            />
            <button type="button" disabled={!url.trim()} onClick={() => onLoadUrl(url.trim())} className={`${btn} disabled:opacity-40`}>Fetch</button>
          </div>
          <p className="mt-1 text-[11px] text-muted">Needs the remote site to allow cross-origin requests (CORS).</p>
        </section>

        <section className="mb-4">
          <p className="mb-1 text-xs text-muted">Open active sheet in /code as…</p>
          <div className="flex gap-1">
            <button type="button" className={btn} onClick={() => onOpenInCode("csv")}>CSV</button>
            <button type="button" className={btn} onClick={() => onOpenInCode("json")}>JSON</button>
            <button type="button" className={btn} onClick={() => onOpenInCode("python")}>Python</button>
          </div>
        </section>

        <section className="mb-2">
          <p className="mb-1 text-xs text-muted">Image</p>
          <button type="button" className={btn} onClick={onExportPng}>Export grid as PNG</button>
        </section>

        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onClose} className={btn}>Close</button>
        </div>
      </div>
    </div>
  );
}
