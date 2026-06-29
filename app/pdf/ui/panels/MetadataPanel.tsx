/**
 * View + edit document info dictionary.
 */
import { useEffect, useState } from "react";
import type { OpenDoc } from "~/pdf/lib/state";
import { readMetadata, writeMetadata, type Metadata } from "~/pdf/lib/metadata";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

const FIELDS: Array<{ key: keyof Metadata; label: string; type?: string }> = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords (comma-separated)" },
  { key: "creator", label: "Creator" },
  { key: "producer", label: "Producer" },
  { key: "creationDate", label: "Creation date (ISO)", type: "datetime-local" },
  { key: "modificationDate", label: "Modification date (ISO)", type: "datetime-local" },
];

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local wants yyyy-MM-ddTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function MetadataPanel({ doc, busy, onReplace, onToast }: Props) {
  const [meta, setMeta] = useState<Metadata | null>(null);

  useEffect(() => {
    let alive = true;
    readMetadata(doc.bytes)
      .then((m) => { if (alive) setMeta(m); })
      .catch((e) => onToast(`Failed to read metadata: ${(e as Error).message}`, "error"));
    return () => { alive = false; };
  }, [doc.id, doc.rev]);

  if (!meta) return <div className="text-sm text-muted">Loading metadata…</div>;

  const apply = async () => {
    try {
      const out = await writeMetadata(doc.bytes, meta);
      await onReplace(out);
      onToast("Metadata saved");
    } catch (e) {
      onToast(`Failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {FIELDS.map(({ key, label, type }) => {
        const value = type === "datetime-local"
          ? toLocalInput(meta[key])
          : meta[key];
        return (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs text-muted">{label}</span>
            <input
              type={type ?? "text"}
              value={value}
              onChange={(e) =>
                setMeta((m) => m && ({
                  ...m,
                  [key]: type === "datetime-local"
                    ? fromLocalInput(e.target.value)
                    : e.target.value,
                }))
              }
              className="rounded border border-border bg-bg px-2 py-1"
            />
          </label>
        );
      })}

      <button
        type="button"
        disabled={busy}
        onClick={apply}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Save metadata
      </button>
    </div>
  );
}
