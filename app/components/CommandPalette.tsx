/**
 * Command palette modal.
 * Opens on Ctrl-Shift-P / Cmd-Shift-P.
 * Uses fuzzysort for live filtering.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import type { Command, CommandContext } from "~/lib/code-editor/commands";
import { allCommands } from "~/lib/code-editor/commands";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  ctx: CommandContext;
};

export function CommandPalette({ open, onClose, ctx }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const commands = useMemo(() => allCommands(), []);

  // Filter with fuzzysort (lazy import)
  const [filtered, setFiltered] = useState<Command[]>(commands);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(commands);
      setSelected(0);
      return;
    }
    import("fuzzysort").then(({ default: fz }) => {
      const results = fz.go(query, commands, { key: "title", limit: 50, threshold: -10000 });
      setFiltered(results.map((r) => r.obj));
      setSelected(0);
    });
  }, [query, commands]);

  // Sync open state with <dialog>
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) { if (!d.open) { d.showModal(); inputRef.current?.focus(); } }
    else { if (d.open) d.close(); }
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  const run = (cmd: Command) => {
    cmd.run(ctx);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[selected]) run(filtered[selected]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const d = dialogRef.current;
    if (!d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      onClose();
    }
  };

  // Group commands by section
  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      const g = cmd.group;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(cmd);
    }
    return map;
  }, [filtered]);

  let globalIndex = 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="m-auto w-[520px] max-w-full rounded-xl border border-border bg-bg p-0 shadow-2xl backdrop:bg-black/40"
    >
      <div className="border-b border-border px-4 py-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command…"
          className="w-full bg-transparent text-sm focus:outline-none"
          aria-label="Command palette search"
        />
      </div>

      <ul
        ref={listRef}
        role="listbox"
        className="max-h-[400px] overflow-y-auto py-1"
        aria-label="Commands"
      >
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted">No commands found</li>
        )}
        {Array.from(groups.entries()).map(([group, cmds]) => (
          <li key={group} role="presentation">
            <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {group}
            </div>
            <ul role="group">
              {cmds.map((cmd) => {
                const idx = globalIndex++;
                return (
                  <li
                    key={cmd.id}
                    role="option"
                    aria-selected={idx === selected}
                    onClick={() => run(cmd)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`flex cursor-pointer items-center justify-between px-4 py-2 text-sm ${
                      idx === selected ? "bg-border" : ""
                    }`}
                  >
                    <span>{cmd.title}</span>
                    {cmd.shortcut && (
                      <kbd className="ml-4 shrink-0 rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] font-mono text-muted">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
