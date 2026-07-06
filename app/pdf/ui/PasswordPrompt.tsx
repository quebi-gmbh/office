/**
 * Inline prompt shown when an encrypted PDF can't be rendered because pdf.js
 * needs a password. pdf-lib already opened the document (with
 * `ignoreEncryption`), so metadata / page count are visible — only the rendered
 * thumbnails, preview, and text extraction are blocked until a password is
 * supplied. Submitting reruns those loads with the entered value.
 */
import { useState } from "react";
import { Lock } from "lucide-react";

type Props = {
  /** True once a password was tried and rejected — tunes the copy. */
  incorrect: boolean;
  busy: boolean;
  onSubmit: (password: string) => void;
};

export function PasswordPrompt({ incorrect, busy, onSubmit }: Props) {
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value) return;
    onSubmit(value);
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm"
    >
      <div className="flex items-center gap-2 text-amber-400">
        <Lock size={14} aria-hidden />
        <span className="font-medium">
          {incorrect ? "Incorrect password" : "This PDF is password-protected"}
        </span>
      </div>
      <p className="text-xs text-muted">
        {incorrect
          ? "That password didn't unlock the document. Try again to render its pages."
          : "Enter the password to render thumbnails, the preview, and extracted text."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          aria-label="PDF password"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1.5 font-mono text-xs"
        />
        <button
          type="submit"
          disabled={busy || !value}
          className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
        >
          Unlock
        </button>
      </div>
    </form>
  );
}
