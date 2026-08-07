/**
 * AcroForm filler. Lists the document's fields, lets the user edit values, and
 * optionally flattens on save.
 *
 * A flat PDF has nothing to list, so this is also where the other half lives:
 * "Add fields" hands over to Form fields mode, which draws (or detects) the
 * fields and comes back here to fill them.
 */
import { useEffect, useState } from "react";
import { FormInput } from "lucide-react";
import type { OpenDoc } from "~/pdf/lib/state";
import { fillFormFields, listFormFields, type FieldInfo } from "~/pdf/lib/forms";

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
  /** Switch to Form fields mode to author fields for this document. */
  onAddFields: () => void;
};

export function FormsPanel({ doc, busy, onReplace, onToast, onAddFields }: Props) {
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flatten, setFlatten] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listFormFields(doc.bytes)
      .then((f) => {
        if (!alive) return;
        setFields(f);
        const initial: Record<string, string> = {};
        for (const fld of f) initial[fld.name] = fld.value;
        setValues(initial);
      })
      .catch((e) => onToast(`Failed to read form: ${(e as Error).message}`, "error"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [doc.id, doc.rev]);

  const apply = async () => {
    try {
      const updates = fields
        .filter((f) => f.kind !== "button" && f.kind !== "signature" && f.kind !== "unknown")
        .map((f) => ({ name: f.name, value: values[f.name] ?? "" }));
      const out = await fillFormFields(doc.bytes, updates, flatten);
      await onReplace(out);
      onToast(flatten ? "Form filled & flattened" : "Form filled");
    } catch (e) {
      onToast(`Fill failed: ${(e as Error).message}`, "error");
    }
  };

  const addFieldsButton = (
    <button
      type="button"
      onClick={onAddFields}
      className="flex items-center gap-1.5 self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
    >
      <FormInput size={15} aria-hidden /> Add fields
    </button>
  );

  if (loading) return <div className="text-sm text-muted">Reading form fields…</div>;
  if (fields.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          This PDF has no form fields yet — there's nothing to fill in.
        </p>
        <p className="text-xs text-muted">
          Form fields mode can draw them by hand, or propose them automatically
          from the page's underlines and underscore runs. Come back here to type
          into them once they're in.
        </p>
        {addFieldsButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {fields.length} field{fields.length === 1 ? "" : "s"} detected.
        </p>
        <button
          type="button"
          onClick={onAddFields}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-fg"
        >
          <FormInput size={13} aria-hidden /> Add more fields
        </button>
      </div>

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
        {fields.map((f) => {
          const value = values[f.name] ?? "";
          const set = (v: string) => setValues((cur) => ({ ...cur, [f.name]: v }));
          return (
            <label key={f.name} className="flex flex-col gap-1 rounded border border-border bg-card p-2">
              <span className="text-xs text-muted">
                <span className="font-mono">{f.kind}</span>{" "}
                · <span className="text-fg">{f.name}</span>
              </span>
              {f.kind === "text" && (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="rounded border border-border bg-bg px-2 py-1"
                />
              )}
              {f.kind === "checkbox" && (
                <select
                  value={value || "false"}
                  onChange={(e) => set(e.target.value)}
                  className="rounded border border-border bg-bg px-2 py-1"
                >
                  <option value="true">Checked</option>
                  <option value="false">Unchecked</option>
                </select>
              )}
              {(f.kind === "radio" || f.kind === "dropdown") && (
                <select
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="rounded border border-border bg-bg px-2 py-1"
                >
                  <option value="">(none)</option>
                  {(f.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              {f.kind === "options" && (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder="comma-separated"
                  className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
                />
              )}
              {(f.kind === "button" || f.kind === "signature" || f.kind === "unknown") && (
                <span className="text-xs italic text-muted">(read-only)</span>
              )}
            </label>
          );
        })}
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={flatten}
          onChange={(e) => setFlatten(e.target.checked)}
          className="accent-accent"
        />
        <span>Flatten form (values become un-editable annotations)</span>
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={apply}
        className="self-start rounded border border-accent bg-accent/15 px-3 py-1.5 text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        Apply values
      </button>
    </div>
  );
}
