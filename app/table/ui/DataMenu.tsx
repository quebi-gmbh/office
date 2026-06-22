/**
 * "Data" menu dropdown — triggers the data transforms. Parameters that need
 * input use prompts to keep the surface small; the active selection supplies the
 * target column(s).
 */
import { useEffect, useRef, useState } from "react";
import { Wand2 } from "lucide-react";

export type DataAction =
  | "dedupe"
  | "split"
  | "merge"
  | "trim"
  | "upper"
  | "lower"
  | "title"
  | "regex"
  | "fillDown"
  | "transpose"
  | "unpivot"
  | "group"
  | "flashFill";

const ITEMS: { label: string; action: DataAction; sep?: boolean }[] = [
  { label: "Deduplicate rows", action: "dedupe" },
  { label: "Split column…", action: "split" },
  { label: "Merge columns…", action: "merge" },
  { label: "Fill down", action: "fillDown", sep: true },
  { label: "Trim whitespace", action: "trim" },
  { label: "UPPERCASE", action: "upper" },
  { label: "lowercase", action: "lower" },
  { label: "Title Case", action: "title" },
  { label: "Regex replace…", action: "regex" },
  { label: "Flash fill", action: "flashFill", sep: true },
  { label: "Group + aggregate…", action: "group" },
  { label: "Transpose", action: "transpose", sep: true },
  { label: "Unpivot / melt", action: "unpivot" },
];

export function DataMenu({ onAction }: { onAction: (a: DataAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Data transforms"
        className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs transition-colors hover:border-accent"
      >
        <Wand2 size={12} /> <span>Data</span> <span className="text-muted">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded border border-border bg-bg py-1 shadow-lg">
          {ITEMS.map((it) => (
            <div key={it.action}>
              {it.sep && <div className="my-1 h-px bg-border" role="separator" />}
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => { e.preventDefault(); setOpen(false); onAction(it.action); }}
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-border"
              >
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
