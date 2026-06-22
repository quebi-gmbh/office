/**
 * Formula bar above the grid. Shows the active cell's raw content (the formula
 * source for `=` cells) and commits edits back to that cell.
 */
import { useEffect, useState } from "react";
import { colToLabel } from "~/table/lib/model";

interface FormulaBarProps {
  /** Active cell in SOURCE coordinates. */
  row: number;
  col: number;
  value: string;
  onCommit: (value: string) => void;
}

export function FormulaBar({ row, col, value, onCommit }: FormulaBarProps) {
  const [draft, setDraft] = useState(value);
  // Resync when the active cell or its underlying value changes.
  useEffect(() => setDraft(value), [value, row, col]);

  return (
    <div className="flex items-center gap-2 border-b border-border px-1 py-1">
      <span className="w-12 shrink-0 text-center text-xs font-medium text-muted">
        {colToLabel(col)}{row + 1}
      </span>
      <span className="select-none text-xs text-muted">ƒx</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onCommit(draft); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "Escape") { e.preventDefault(); setDraft(value); (e.target as HTMLInputElement).blur(); }
        }}
        onBlur={() => { if (draft !== value) onCommit(draft); }}
        placeholder="Enter a value or =formula"
        spellCheck={false}
        className="h-6 flex-1 rounded border border-transparent bg-transparent px-1.5 font-mono text-xs outline-none focus:border-border"
      />
    </div>
  );
}
