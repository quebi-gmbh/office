/**
 * Single rendered page thumbnail. Lazily renders via the cache, shows a
 * skeleton while pending, and exposes click / keyboard selection.
 */
import { useEffect, useState } from "react";
import { getThumbnail } from "~/pdf/lib/thumb-cache";

type Props = {
  docId: string;
  rev: number;
  bytes: Uint8Array;
  password?: string;
  page: number;
  width: number;
  selected: boolean;
  onToggle: (page: number, modKey: boolean, shiftKey: boolean) => void;
};

export function PageThumb({
  docId,
  rev,
  bytes,
  password,
  page,
  width,
  selected,
  onToggle,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setError(null);
    getThumbnail(docId, rev, bytes, page, width, password)
      .then((url) => { if (alive) setSrc(url); })
      .catch((e) => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [docId, rev, bytes, password, page, width]);

  return (
    <button
      type="button"
      onClick={(e) => onToggle(page, e.metaKey || e.ctrlKey, e.shiftKey)}
      aria-pressed={selected}
      className={`group relative flex flex-col items-center gap-1 rounded-lg border p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        selected
          ? "border-accent bg-accent/10"
          : "border-border bg-card hover:border-accent/40"
      }`}
      style={{ width: width + 8 }}
    >
      <div
        className="flex items-center justify-center overflow-hidden rounded bg-white"
        style={{ width, minHeight: width * 1.2 }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Page ${page + 1}`} style={{ width, display: "block" }} />
        ) : error ? (
          <span className="p-2 text-center text-[0.65rem] text-red-500">
            {error}
          </span>
        ) : (
          <div className="h-full w-full animate-pulse bg-zinc-200" style={{ minHeight: width * 1.2 }} />
        )}
      </div>
      <span className="text-[0.7rem] font-mono text-muted">{page + 1}</span>
    </button>
  );
}
