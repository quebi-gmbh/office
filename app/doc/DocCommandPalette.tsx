/**
 * DocCommandPalette — command palette for the document editor.
 *
 * Thin wrapper that reads from allDocCommands() (doc-editor commands) instead
 * of the code editor's allCommands(). Triggered by Ctrl-Shift-P.
 *
 * Reuses the same UI conventions as CommandPalette.tsx (fuzzy substring filter,
 * grouped sections, keyboard nav). A future refactor could unify both by
 * accepting a `commands` prop on the shared component.
 */
import { useState, useEffect, useRef } from "react";
import type { DocCommandContext } from "./commands";
import { allDocCommands } from "./commands";

interface Props {
  open: boolean;
  onClose: () => void;
  ctx: DocCommandContext;
}

export function DocCommandPalette({ open, onClose, ctx }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync open state to the native dialog
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const all = allDocCommands();
  const filtered = query
    ? all.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.group.toLowerCase().includes(query.toLowerCase()),
      )
    : all;

  // Group results
  const groups: Record<string, typeof filtered> = {};
  for (const cmd of filtered) {
    if (!groups[cmd.group]) groups[cmd.group] = [];
    groups[cmd.group].push(cmd);
  }

  function run(cmd: (typeof all)[0]) {
    onClose();
    cmd.run(ctx);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selected]) run(filtered[selected]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="w-full max-w-lg rounded-lg border border-border bg-bg p-0 shadow-xl backdrop:bg-fg/20 backdrop:backdrop-blur-sm"
    >
      <div className="border-b border-border px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search commands…"
          className="w-full bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
        />
      </div>

      <div className="max-h-80 overflow-y-auto py-1">
        {Object.entries(groups).map(([group, cmds]) => (
          <div key={group}>
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {group}
            </div>
            {cmds.map((cmd) => {
              const idx = filtered.indexOf(cmd);
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    run(cmd);
                  }}
                  onMouseEnter={() => setSelected(idx)}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                    idx === selected ? "bg-border" : "hover:bg-border"
                  }`}
                >
                  <span>{cmd.title}</span>
                  {cmd.shortcut && (
                    <kbd className="ml-6 text-xs text-muted">{cmd.shortcut}</kbd>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted">
            No commands match &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </dialog>
  );
}
