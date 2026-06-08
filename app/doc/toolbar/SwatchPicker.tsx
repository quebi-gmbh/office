/**
 * A small swatch color-picker popover for text color and highlight.
 *
 * Renders a grid of preset swatches plus a "clear" entry. Positioned via
 * a simple CSS absolute+relative wrapper (no tippy.js dep).
 */
import { useEffect, useRef, useState } from "react";

const SWATCHES = [
  // Row 1: greys
  "#18181b", "#52525b", "#a1a1aa", "#d4d4d8",
  // Row 2: warm
  "#ef4444", "#f97316", "#eab308", "#84cc16",
  // Row 3: cool
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6",
  // Row 4: vivid
  "#ec4899", "#f43f5e", "#14b8a6", "#a78bfa",
];

type SwatchPickerProps = {
  /** Label for the trigger button (e.g. "A" with underline, or a highlight icon). */
  label: React.ReactNode;
  /** Title / aria-label for the trigger button. */
  title: string;
  /** Current active color (hex) or null if none. */
  activeColor: string | null;
  /** Called with a hex color string when a swatch is chosen. */
  onPick: (color: string) => void;
  /** Called when the "clear" swatch is chosen. */
  onClear: () => void;
};

export function SwatchPicker({
  label,
  title,
  activeColor,
  onPick,
  onClear,
}: SwatchPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault(); // keep editor focus
          setOpen((v) => !v);
        }}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card text-xs transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 ${
          activeColor ? "border-accent" : ""
        }`}
      >
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute left-0 top-full z-50 mt-1 rounded border border-border bg-bg p-2 shadow-lg"
        >
          <div className="grid grid-cols-4 gap-1">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(color);
                  setOpen(false);
                }}
                title={color}
                aria-label={color}
                className={`h-5 w-5 rounded border-2 transition-transform hover:scale-110 ${
                  activeColor === color
                    ? "border-accent scale-110"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Clear */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onClear();
              setOpen(false);
            }}
            className="mt-2 w-full rounded border border-border bg-card px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-fg transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
