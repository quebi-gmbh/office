/**
 * "Open from URL" modal.
 * Fetches the URL, detects language from extension, populates the editor.
 */
import { useRef, useState } from "react";
import { langFromFilename } from "./languages";
import type { Lang } from "./languages";

type UrlModalProps = {
  open: boolean;
  onClose: () => void;
  onLoad: (text: string, lang: Lang, name: string) => void;
};

export function UrlModal({ open, onClose, onLoad }: UrlModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync open state with <dialog>
  const syncRef = (el: HTMLDialogElement | null) => {
    (dialogRef as React.MutableRefObject<HTMLDialogElement | null>).current = el;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      const name = url.split("/").at(-1) ?? "file.txt";
      const lang = langFromFilename(name);
      onLoad(text, lang, name);
      onClose();
      setUrl("");
    } catch (err) {
      const msg =
        err instanceof TypeError
          ? "Could not fetch — check the URL or a CORS restriction may be blocking it."
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <dialog
      ref={syncRef}
      onClose={onClose}
      className="rounded-xl border border-border bg-bg p-6 shadow-2xl backdrop:bg-black/30 w-[480px] max-w-full"
    >
      <h2 className="mb-4 text-base font-semibold">Open from URL</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/file.ts"
          required
          autoFocus
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-muted hover:bg-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-quebi-brand px-3 py-1.5 text-sm text-quebi-on-brand hover:bg-quebi-brand-hover disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading…" : "Open"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
