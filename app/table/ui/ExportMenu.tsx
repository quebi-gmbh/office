/**
 * "Download as…" / "Copy as…" dropdown. One component, two modes; lists the
 * export targets and reports the picked target id back to the caller.
 */
import { useEffect, useRef, useState } from "react";
import { EXPORT_TARGETS } from "~/table/io/export";

interface ExportMenuProps {
  mode: "download" | "copy";
  label: string;
  icon: React.ReactNode;
  onPick: (targetId: string) => void;
}

export function ExportMenu({ mode, label, icon, onPick }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Copy mode can't sensibly copy a binary workbook to the clipboard.
  const targets = EXPORT_TARGETS.filter((t) => mode === "download" || !t.binary);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs transition-colors hover:border-accent"
      >
        {icon}
        <span>{label}</span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 max-h-[60vh] min-w-[200px] overflow-auto rounded border border-border bg-bg py-1 shadow-lg">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onPick(t.id);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-border"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
