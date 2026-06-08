/**
 * TemplatePicker — a drawer for starting from a built-in or custom template.
 */
import { useEffect, useState } from "react";
import { Drawer } from "~/components/Drawer";
import { BUILTIN_TEMPLATES } from "./templates/index";
import { loadCustomTemplates, deleteCustomTemplate } from "./templates/storage";
import type { DocTemplate } from "./templates/index";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (template: DocTemplate) => void;
}

export function TemplatePicker({ open, onClose, onSelect }: Props) {
  const [custom, setCustom] = useState<DocTemplate[]>([]);

  // Reload custom templates whenever the drawer opens
  useEffect(() => {
    if (open) setCustom(loadCustomTemplates());
  }, [open]);

  function pick(t: DocTemplate) {
    onSelect(t);
    onClose();
  }

  function removeCustom(id: string) {
    deleteCustomTemplate(id);
    setCustom((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <Drawer open={open} onClose={onClose} title="Templates">
      {/* Built-in section */}
      <div className="px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Built-in
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BUILTIN_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t)}
              className="rounded border border-border bg-card p-3 text-left transition-colors hover:border-accent"
            >
              <p className="text-sm font-medium">{t.name}</p>
              <p className="mt-0.5 text-[11px] text-muted">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom section */}
      {custom.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            My templates
          </p>
          <div className="divide-y divide-border">
            {custom.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2">
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className="flex-1 text-left text-sm hover:text-accent"
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeCustom(t.id)}
                  className="ml-2 rounded p-1 text-xs text-muted hover:bg-border hover:text-fg"
                  aria-label={`Delete template ${t.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}
