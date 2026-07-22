/**
 * Tiny popup menu positioned at a screen coordinate. Closes on outside click,
 * Escape, or after an item runs.
 */
import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  separator?: boolean;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[180px] rounded border border-border bg-bg py-1 shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - items.length * 30 - 10) }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="my-1 h-px bg-border" role="separator" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-border ${
              item.danger ? "text-red-600" : ""
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
