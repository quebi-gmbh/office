/**
 * Slash menu popover list — rendered by the TipTap Suggestion plugin.
 *
 * Exposed via forwardRef with an imperative handle so the Suggestion
 * plugin can forward keyboard events (Up/Down/Enter/Esc) to the list.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export type SlashMenuItem = {
  title: string;
  description: string;
  icon: string; // emoji/text icon for simplicity
  command: () => void;
};

export type SlashMenuHandle = {
  onKeyDown: (e: KeyboardEvent) => boolean;
};

type SlashMenuListProps = {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
};

export const SlashMenuList = forwardRef<SlashMenuHandle, SlashMenuListProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    // Reset selection when items change (query updated)
    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown(e: KeyboardEvent) {
        if (e.key === "ArrowUp") {
          setSelected((s) => (s <= 0 ? items.length - 1 : s - 1));
          return true;
        }
        if (e.key === "ArrowDown") {
          setSelected((s) => (s >= items.length - 1 ? 0 : s + 1));
          return true;
        }
        if (e.key === "Enter") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded border border-border bg-bg px-3 py-2 text-xs text-muted shadow-lg">
          No results
        </div>
      );
    }

    return (
      <div
        className="z-50 max-h-80 w-56 overflow-y-auto rounded border border-border bg-bg py-1 shadow-lg"
        role="listbox"
        aria-label="Insert block"
      >
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            role="option"
            aria-selected={i === selected}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            onMouseEnter={() => setSelected(i)}
            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
              i === selected ? "bg-border" : "hover:bg-border"
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-card text-sm">
              {item.icon}
            </span>
            <div className="min-w-0">
              <div className="font-medium leading-snug">{item.title}</div>
              <div className="truncate text-xs text-muted">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    );
  },
);

SlashMenuList.displayName = "SlashMenuList";
