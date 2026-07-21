/**
 * Header Save button — a single, consistent save affordance for every tool.
 * Driven by the active editor's registered guard (see `dirty-guard.ts`): shown
 * whenever a tool is focused, enabled only when there are unsaved changes.
 */
import { useState } from "react";
import { Check, Save } from "lucide-react";
import { useGuardState } from "~/lib/workspace";

export function SaveButton() {
  const g = useGuardState();
  const [saving, setSaving] = useState(false);
  if (!g.active) return null;

  return (
    <button
      type="button"
      disabled={!g.dirty || saving}
      title={g.dirty ? `Save ${g.name} (Ctrl/Cmd+S)` : "Saved"}
      onClick={async () => {
        setSaving(true);
        try {
          await g.save();
        } finally {
          setSaving(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm font-medium transition hover:border-accent/40 disabled:opacity-40"
    >
      {g.dirty ? <Save size={15} aria-hidden /> : <Check size={15} aria-hidden />}
      {g.dirty ? (saving ? "Saving…" : "Save") : "Saved"}
    </button>
  );
}
