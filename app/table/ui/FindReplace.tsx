/**
 * Find & replace panel for `/table`. Floats over the top-right of the grid.
 * Scope (sheet / selection), case / regex / whole-cell toggles, match
 * navigation, and replace / replace-all.
 */
import { useEffect, useMemo, useState } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { type FindOptions, findMatches } from "~/table/lib/find";
import type { TableDoc, CellPos } from "~/table/lib/model";
import type { Rect } from "~/table/lib/selection";

interface FindReplaceProps {
  doc: TableDoc;
  selectionRect: Rect;
  onClose: () => void;
  /** Move the grid selection/focus to a matched cell. */
  onGoto: (pos: CellPos) => void;
  onReplaceOne: (pos: CellPos, query: string, opts: FindOptions, replacement: string) => void;
  onReplaceAll: (query: string, replacement: string, opts: FindOptions) => number;
}

export function FindReplace({
  doc,
  selectionRect,
  onClose,
  onGoto,
  onReplaceOne,
  onReplaceAll,
}: FindReplaceProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [scope, setScope] = useState<"sheet" | "selection">("sheet");
  const [current, setCurrent] = useState(0);

  const opts = useMemo<FindOptions>(
    () => ({ caseSensitive, regex, wholeCell, scope, rect: selectionRect }),
    [caseSensitive, regex, wholeCell, scope, selectionRect],
  );

  const matches = useMemo(() => findMatches(doc, query, opts), [doc, query, opts]);

  // Keep the cursor in range and jump to the active match.
  useEffect(() => {
    if (matches.length === 0) {
      setCurrent(0);
      return;
    }
    const idx = current % matches.length;
    onGoto(matches[idx]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, current]);

  const go = (delta: number) => {
    if (matches.length === 0) return;
    setCurrent((c) => (c + delta + matches.length) % matches.length);
  };

  const activePos = matches.length ? matches[current % matches.length] : null;

  const toggle =
    "rounded border px-1.5 py-0.5 text-[11px] transition-colors";
  const toggleOn = "border-accent bg-accent/20 text-accent";
  const toggleOff = "border-border bg-card text-muted hover:text-fg";

  return (
    <div className="absolute right-2 top-2 z-30 w-72 rounded-lg border border-border bg-bg p-2 shadow-xl">
      <div className="mb-1.5 flex items-center gap-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrent(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Find"
          className="h-7 flex-1 rounded border border-border bg-card px-2 text-xs outline-none focus:border-accent"
        />
        <span className="w-16 text-right text-[11px] text-muted">
          {matches.length ? `${(current % matches.length) + 1}/${matches.length}` : "0/0"}
        </span>
        <button type="button" onClick={() => go(-1)} className="rounded p-1 text-muted hover:bg-border hover:text-fg" title="Previous (Shift+Enter)">
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={() => go(1)} className="rounded p-1 text-muted hover:bg-border hover:text-fg" title="Next (Enter)">
          <ChevronDown size={14} />
        </button>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-border hover:text-fg" title="Close (Esc)">
          <X size={14} />
        </button>
      </div>

      <div className="mb-1.5 flex items-center gap-1">
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Replace with"
          className="h-7 flex-1 rounded border border-border bg-card px-2 text-xs outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => {
            if (activePos) {
              onReplaceOne(activePos, query, opts, replacement);
              // matches recompute; keep index, it will re-clamp.
            }
          }}
          disabled={!activePos}
          className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={() => {
            const n = onReplaceAll(query, replacement, opts);
            setCurrent(0);
            void n;
          }}
          disabled={matches.length === 0}
          className="rounded border border-accent bg-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/30 disabled:opacity-40"
        >
          All
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => setCaseSensitive((v) => !v)} className={`${toggle} ${caseSensitive ? toggleOn : toggleOff}`} title="Match case">Aa</button>
        <button type="button" onClick={() => setRegex((v) => !v)} className={`${toggle} ${regex ? toggleOn : toggleOff}`} title="Regular expression">.*</button>
        <button type="button" onClick={() => setWholeCell((v) => !v)} className={`${toggle} ${wholeCell ? toggleOn : toggleOff}`} title="Whole cell">[ ]</button>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-muted">
          <button type="button" onClick={() => setScope("sheet")} className={`${toggle} ${scope === "sheet" ? toggleOn : toggleOff}`}>Sheet</button>
          <button type="button" onClick={() => setScope("selection")} className={`${toggle} ${scope === "selection" ? toggleOn : toggleOff}`}>Selection</button>
        </div>
      </div>
    </div>
  );
}
