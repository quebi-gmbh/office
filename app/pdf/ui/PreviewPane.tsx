/**
 * Single-page preview at higher resolution than the thumbnail strip.
 */
import { useEffect, useState } from "react";
import { getThumbnail } from "~/pdf/lib/thumb-cache";
import type { OpenDoc } from "~/pdf/lib/state";

type Props = {
  doc: OpenDoc;
  page: number;
  width: number;
};

export function PreviewPane({ doc, page, width }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setErr(null);
    getThumbnail(doc.id, doc.rev, doc.bytes, page, width, doc.password)
      .then((u) => { if (alive) setSrc(u); })
      .catch((e) => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [doc.id, doc.rev, doc.bytes, doc.password, page, width]);

  if (err) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
        Couldn't render page {page + 1}: {err}
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className="animate-pulse rounded-lg border border-border bg-card"
        style={{ width, height: width * 1.4 }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-lg">
      <img src={src} alt={`Page ${page + 1} preview`} style={{ width, display: "block" }} />
    </div>
  );
}
