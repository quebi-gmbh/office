/**
 * "File" dropdown menu in the code editor toolbar.
 * Groups Open / Open URL / Download / Save / Share / Print / Export PNG.
 */
import { useRef, useState, useEffect } from "react";

type FileMenuAction =
  | "open"
  | "open-url"
  | "download"
  | "save"
  | "share"
  | "print"
  | "export-png";

type MenuItem = {
  action: FileMenuAction;
  label: string;
  shortcut?: string;
};

const ITEMS: MenuItem[] = [
  { action: "open",       label: "Open file…",        shortcut: "Ctrl+O"  },
  { action: "open-url",   label: "Open from URL…"                          },
  { action: "download",   label: "Download"                                 },
  { action: "save",       label: "Save",               shortcut: "Ctrl+S"  },
  { action: "share",      label: "Share via URL…"                          },
  { action: "print",      label: "Print",              shortcut: "Ctrl+P"  },
  { action: "export-png", label: "Export as PNG"                            },
];

// Divider after open-url and save
const DIVIDERS_AFTER = new Set<FileMenuAction>(["open-url", "save"]);

type FileMenuProps = {
  onAction: (action: FileMenuAction) => void;
};

export function FileMenu({ onAction }: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-border transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        File
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 7L1 3h8L5 7z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {ITEMS.map((item) => (
            <div key={item.action}>
              <button
                role="menuitem"
                type="button"
                className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-sm hover:bg-border transition-colors"
                onClick={() => {
                  setOpen(false);
                  onAction(item.action);
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <kbd className="text-xs text-muted font-mono">{item.shortcut}</kbd>
                )}
              </button>
              {DIVIDERS_AFTER.has(item.action) && (
                <hr className="my-1 border-border" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { FileMenuAction };
