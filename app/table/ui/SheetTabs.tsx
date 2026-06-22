/**
 * Bottom sheet-tab strip: switch, rename (double-click), reorder (drag),
 * duplicate, and delete sheets.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Workbook } from "~/table/lib/workbook";

interface SheetTabsProps {
  workbook: Workbook;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRename: (i: number, name: string) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
  onMove: (from: number, to: number) => void;
}

export function SheetTabs({ workbook, onSelect, onAdd, onRename, onDelete, onDuplicate, onMove }: SheetTabsProps) {
  const [editing, setEditing] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-t border-border px-1 py-1">
      {workbook.sheets.map((s, i) => {
        const active = i === workbook.active;
        return (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i); setDragFrom(null); }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (confirm(`Duplicate sheet "${s.name}"? (Cancel to delete)`)) onDuplicate(i);
              else onDelete(i);
            }}
            className={`flex shrink-0 items-center gap-1 rounded-t border-b-2 px-2 py-0.5 text-xs ${
              active ? "border-accent bg-card text-fg" : "border-transparent text-muted hover:bg-card/50"
            }`}
          >
            {editing === i ? (
              <input
                autoFocus
                defaultValue={s.name}
                onBlur={(e) => { onRename(i, e.target.value); setEditing(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onRename(i, (e.target as HTMLInputElement).value); setEditing(null); }
                  if (e.key === "Escape") setEditing(null);
                }}
                className="w-20 bg-transparent outline-none"
              />
            ) : (
              <button type="button" onClick={() => onSelect(i)} onDoubleClick={() => setEditing(i)} className="max-w-[160px] truncate">
                {s.name}
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        title="Add sheet"
        aria-label="Add sheet"
        className="shrink-0 rounded p-1 text-muted hover:bg-card hover:text-accent"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
