/**
 * Security panel — limited to "remove password" because pdf-lib doesn't
 * support producing encrypted PDFs. We explain that limitation up-front
 * instead of pretending to encrypt and silently doing nothing.
 */
import type { OpenDoc } from "~/pdf/lib/state";
import { removePassword } from "~/pdf/lib/security";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function SecurityPanel({ doc, busy, onReplace, onToast }: Props) {
  const remove = async () => {
    try {
      const out = await removePassword(doc.bytes);
      await onReplace(out);
      onToast(doc.encrypted ? "Password removed" : "Re-saved (no encryption was present)");
    } catch (e) {
      onToast(`Failed: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="rounded border border-border bg-card px-3 py-2">
        <div className="text-xs uppercase tracking-wider text-muted">Status</div>
        <div className="mt-1">
          {doc.encrypted ? (
            <span className="text-amber-400">Encrypted</span>
          ) : (
            <span className="text-accent">Not encrypted</span>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={busy || !doc.encrypted}
        onClick={remove}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Remove password / decrypt
      </button>

      <p className="text-xs text-muted">
        Adding a password isn't currently supported — pdf-lib doesn't implement
        PDF encryption. If you need that, encrypt the saved file with
        <code className="mx-1 rounded bg-bg px-1 py-0.5">qpdf</code> or your OS's
        print-to-PDF dialog.
      </p>
    </div>
  );
}
