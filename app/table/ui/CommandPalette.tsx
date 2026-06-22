/**
 * Command palette for /table (Ctrl/Cmd-Shift-P). Self-contained — mirrors the
 * look + fuzzy-search behaviour of the /code palette but with table commands:
 * every export target, the data ops, and settings.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EXPORT_TARGETS } from "~/table/io/export";

export interface TableCommandCtx {
  exportTo: (id: string, mode: "download" | "copy") => void;
  sortActive: (dir: "asc" | "desc") => void;
  openFind: () => void;
  openSettings: () => void;
  newDoc: () => void;
  importFile: () => void;
  insertRow: () => void;
  insertCol: () => void;
  dataAction: (a: string) => void;
}

const DATA_OPS: { id: string; title: string }[] = [
  { id: "dedupe", title: "Deduplicate rows" },
  { id: "split", title: "Split column" },
  { id: "merge", title: "Merge columns" },
  { id: "fillDown", title: "Fill down" },
  { id: "trim", title: "Trim whitespace" },
  { id: "upper", title: "Uppercase" },
  { id: "lower", title: "Lowercase" },
  { id: "title", title: "Title case" },
  { id: "regex", title: "Regex replace" },
  { id: "flashFill", title: "Flash fill" },
  { id: "group", title: "Group + aggregate" },
  { id: "transpose", title: "Transpose" },
  { id: "unpivot", title: "Unpivot / melt" },
];

interface Cmd {
  id: string;
  title: string;
  group: string;
  run: (c: TableCommandCtx) => void;
}

function buildCommands(): Cmd[] {
  const cmds: Cmd[] = [
    { id: "new", title: "New table", group: "File", run: (c) => c.newDoc() },
    { id: "import", title: "Import / open file…", group: "File", run: (c) => c.importFile() },
    { id: "find", title: "Find & replace", group: "Data", run: (c) => c.openFind() },
    { id: "sort-asc", title: "Sort active column ascending", group: "Data", run: (c) => c.sortActive("asc") },
    { id: "sort-desc", title: "Sort active column descending", group: "Data", run: (c) => c.sortActive("desc") },
    { id: "insert-row", title: "Insert row", group: "Data", run: (c) => c.insertRow() },
    { id: "insert-col", title: "Insert column", group: "Data", run: (c) => c.insertCol() },
    { id: "settings", title: "Open settings", group: "Settings", run: (c) => c.openSettings() },
  ];
  for (const op of DATA_OPS) {
    cmds.push({ id: `data-${op.id}`, title: op.title, group: "Transform", run: (c) => c.dataAction(op.id) });
  }
  for (const t of EXPORT_TARGETS) {
    cmds.push({ id: `dl-${t.id}`, title: `Download as ${t.label}`, group: "Download as", run: (c) => c.exportTo(t.id, "download") });
    if (!t.binary) cmds.push({ id: `cp-${t.id}`, title: `Copy as ${t.label}`, group: "Copy as", run: (c) => c.exportTo(t.id, "copy") });
  }
  return cmds;
}

export function CommandPalette({
  open,
  onClose,
  ctx,
}: {
  open: boolean;
  onClose: () => void;
  ctx: TableCommandCtx;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const commands = useMemo(buildCommands, []);
  const [filtered, setFiltered] = useState<Cmd[]>(commands);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(commands);
      setSelected(0);
      return;
    }
    void import("fuzzysort").then(({ default: fz }) => {
      const results = fz.go(query, commands, { key: "title", limit: 50, threshold: -10000 });
      setFiltered(results.map((r) => r.obj));
      setSelected(0);
    });
  }, [query, commands]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      if (!d.open) {
        d.showModal();
        setQuery("");
        setSelected(0);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else if (d.open) {
      d.close();
    }
  }, [open]);

  const run = (cmd: Cmd) => {
    cmd.run(ctx);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-0 w-[min(560px,92vw)] rounded-xl border border-border bg-bg p-0 shadow-2xl backdrop:bg-black/40"
      style={{ top: "12vh", left: "50%", transform: "translateX(-50%)", position: "fixed" }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
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
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Type a command…"
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
      />
      <ul className="max-h-[50vh] overflow-auto py-1">
        {filtered.map((cmd, i) => (
          <li key={cmd.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                run(cmd);
              }}
              onMouseEnter={() => setSelected(i)}
              className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm ${
                i === selected ? "bg-accent/20 text-fg" : "text-muted"
              }`}
            >
              <span>{cmd.title}</span>
              <span className="text-xs text-muted">{cmd.group}</span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted">No matching commands</li>
        )}
      </ul>
    </dialog>
  );
}
