/**
 * /table — root component.
 *
 * Owns the working `TableDoc`, the selection, the undo/redo history, and the
 * debounced IndexedDB autosave. The grid below is a controlled view: it renders
 * `doc` + `selection` and reports edits back up so every mutation flows through
 * a single `apply()` choke-point (history + autosave).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Undo2, Redo2, FilePlus2 } from "lucide-react";
import {
  type TableDoc,
  createEmptyDoc,
  setCell,
  clearRange,
  setColWidth,
} from "~/table/lib/model";
import { type Selection, type Rect, singleCell } from "~/table/lib/selection";
import { createHistory } from "~/table/lib/history";
import { createAutosaver, loadDoc } from "~/table/io/persist";
import { Grid } from "./Grid";

export function TableApp() {
  const [doc, setDoc] = useState<TableDoc>(() => createEmptyDoc());
  const [selection, setSelection] = useState<Selection>(() => singleCell(0, 0));
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, force] = useState(0);

  const history = useRef(createHistory<TableDoc>(doc));
  const autosaver = useRef(createAutosaver((at) => setSavedAt(at)));

  // ── Load persisted doc once ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void (async () => {
      const saved = await loadDoc();
      if (alive && saved) {
        setDoc(saved);
        history.current.reset(saved);
      }
      if (alive) setLoaded(true);
    })();
    const saver = autosaver.current;
    return () => {
      alive = false;
      saver.flush();
      saver.stop();
    };
  }, []);

  // ── Central mutation choke-point ───────────────────────────────────────────
  const apply = useCallback(
    (next: TableDoc, opts: { history?: boolean } = {}) => {
      if (next === doc) return;
      setDoc(next);
      if (opts.history !== false) history.current.push(next);
      autosaver.current.schedule(next);
    },
    [doc],
  );

  const onCommitCell = useCallback(
    (r: number, c: number, value: string) => {
      apply(setCell(doc, r, c, value));
    },
    [doc, apply],
  );

  const onClearRange = useCallback(
    (rect: Rect) => {
      apply(clearRange(doc, rect.r0, rect.c0, rect.r1, rect.c1));
    },
    [doc, apply],
  );

  // Column resize is applied live but kept out of the undo stack (matches the
  // baseline-editing scope; structural resize lands in phase 1.3).
  const onColWidth = useCallback(
    (c: number, width: number) => {
      apply(setColWidth(doc, c, width), { history: false });
    },
    [doc, apply],
  );

  const undo = useCallback(() => {
    const prev = history.current.undo();
    if (prev) {
      setDoc(prev);
      autosaver.current.schedule(prev);
      force((n) => n + 1);
    }
  }, []);

  const redo = useCallback(() => {
    const next = history.current.redo();
    if (next) {
      setDoc(next);
      autosaver.current.schedule(next);
      force((n) => n + 1);
    }
  }, []);

  const newDoc = useCallback(() => {
    if (!confirm("Start a new, empty table? Your current table will be cleared.")) return;
    const fresh = createEmptyDoc();
    setDoc(fresh);
    setSelection(singleCell(0, 0));
    history.current.reset(fresh);
    autosaver.current.schedule(fresh);
  }, []);

  // ── Undo/redo keyboard shortcuts (document-level) ──────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── document.title ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = doc.name ? `${doc.name} — Office` : "Table — Office";
    return () => {
      document.title = "Office";
    };
  }, [doc.name]);

  const btn =
    "inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs transition-colors hover:border-accent disabled:opacity-40 disabled:hover:border-border";

  if (!loaded) {
    return (
      <section className="flex flex-col gap-2" style={{ height: "calc(100vh - 9rem)" }}>
        <div className="h-7 w-48 animate-pulse rounded bg-card" />
        <div className="flex-1 animate-pulse rounded-xl border border-border bg-card" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2" style={{ height: "calc(100vh - 9rem)" }}>
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={doc.name}
          onChange={(e) => apply({ ...doc, name: e.target.value }, { history: false })}
          aria-label="Table name"
          placeholder="Untitled"
          className="h-7 min-w-[8rem] flex-1 border-b border-transparent bg-transparent text-lg font-semibold tracking-tight text-fg placeholder:text-muted/50 focus:border-border focus:outline-none"
        />
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={newDoc} title="New table">
            <FilePlus2 size={12} /> New
          </button>
          <button
            type="button"
            className={btn}
            onClick={undo}
            disabled={!history.current.canUndo()}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={12} /> Undo
          </button>
          <button
            type="button"
            className={btn}
            onClick={redo}
            disabled={!history.current.canRedo()}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={12} /> Redo
          </button>
        </div>
      </header>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <Grid
          doc={doc}
          selection={selection}
          onSelectionChange={setSelection}
          onCommitCell={onCommitCell}
          onClearRange={onClearRange}
          onColWidth={onColWidth}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-1 text-xs text-muted">
        <span>
          {doc.nRows.toLocaleString()} rows × {doc.nCols} cols
        </span>
        <span>
          {savedAt
            ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
            : "All changes saved locally"}
        </span>
      </div>
    </section>
  );
}
