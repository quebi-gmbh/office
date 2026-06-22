/**
 * /table — root component.
 *
 * Owns the working `TableDoc`, the selection, the undo/redo history, and the
 * debounced IndexedDB autosave. The grid below is a controlled view: it renders
 * `doc` + `selection` and reports edits back up so every mutation flows through
 * a single `apply()` choke-point (history + autosave).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Undo2, Redo2, FilePlus2, Upload, Search, Settings, Download, Copy } from "lucide-react";
import {
  type TableDoc,
  type CellPos,
  type ColumnType,
  createEmptyDoc,
  docFromRows,
  setCell,
  setBlock,
  clearRange,
  clearCells,
  setColWidth,
  setRowHeight,
  setColType,
  setColFormat,
  getColFormat,
  setFilters,
  autoColWidth,
  ROW_HEIGHT,
  insertRows,
  deleteRows,
  insertCols,
  deleteCols,
  isEmptyDoc,
} from "~/table/lib/model";
import {
  type ColFormat,
  effectiveType,
  formatValue,
  isNumericType,
  DEFAULT_FORMAT,
} from "~/table/lib/coltypes";
import { type SortKey, sortDoc } from "~/table/lib/sort";
import { type ColumnFilter, computeView } from "~/table/lib/filter";
import {
  type TableSettings,
  loadSettings,
  saveSettings,
  resolveLocale,
} from "~/table/lib/settings";
import {
  type Selection,
  type Rect,
  singleCell,
  rectOf,
} from "~/table/lib/selection";
import { createHistory } from "~/table/lib/history";
import { type FindOptions, replaceAll, replaceInValue } from "~/table/lib/find";
import { createAutosaver, loadDoc } from "~/table/io/persist";
import { copyMatrix } from "~/table/io/clipboard";
import { getCell } from "~/table/lib/model";
import { type ExportCtx, EXPORT_TARGETS } from "~/table/io/export";
import { downloadText, downloadBlob, safeFilename } from "~/table/io/download";
import { streamParse, STREAM_THRESHOLD } from "~/table/io/stream";
import { useToast } from "~/components/Toast";
import {
  sourceFromFile,
  sourceFromText,
  sourceFromClipboard,
  blockFromClipboard,
  isImportableFile,
} from "~/table/io/import";
import { DetectModal, type ImportSource } from "./DetectModal";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { ColumnMenu } from "./ColumnMenu";
import { SettingsDrawer } from "./SettingsDrawer";
import { FindReplace } from "./FindReplace";
import { ExportMenu } from "./ExportMenu";
import { CommandPalette, type TableCommandCtx } from "./CommandPalette";
import { Grid, type HeaderContextInfo, type ColBadge } from "./Grid";

export function TableApp() {
  const [doc, setDoc] = useState<TableDoc>(() => createEmptyDoc());
  const [selection, setSelection] = useState<Selection>(() => singleCell(0, 0));
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [headerCtx, setHeaderCtx] = useState<HeaderContextInfo | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [settings, setSettings] = useState<TableSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnMenu, setColumnMenu] = useState<{ col: number; x: number; y: number } | null>(null);
  const [sortSpec, setSortSpec] = useState<SortKey[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [, force] = useState(0);
  const { show: showToast, ToastContainer } = useToast();

  const locale = useMemo(() => resolveLocale(settings), [settings]);

  // Effective type per column (override, else inferred). Drives display,
  // alignment, sort, and filter.
  const colTypes = useMemo<ColumnType[]>(
    () => Array.from({ length: doc.nCols }, (_, c) => effectiveType(doc, c, locale)),
    [doc, locale],
  );

  // Filter view: visible source rows, or null when no filter is active.
  const view = useMemo(
    () => computeView(doc, doc.filters ?? [], locale),
    [doc, locale],
  );

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

  // ── Streaming import for big delimited files ───────────────────────────────
  const streamImport = useCallback(
    async (file: File) => {
      setProgress(`Parsing ${file.name}…`);
      try {
        const fresh = await streamParse(file, {
          onProgress: (p) =>
            setProgress(
              `Parsing ${file.name}: ${p.rows.toLocaleString()} rows` +
                (p.total ? ` (${Math.round((p.bytes / p.total) * 100)}%)` : ""),
            ),
        });
        setDoc(fresh);
        setSelection(singleCell(0, 0));
        setSortSpec([]);
        history.current.reset(fresh);
        autosaver.current.schedule(fresh);
        showToast(`Imported ${fresh.nRows.toLocaleString()} rows from ${file.name}`);
      } catch (e) {
        showToast(`Parse failed: ${(e as Error).message}`, "error");
      }
      setProgress(null);
    },
    [showToast],
  );

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

  // Map a DISPLAY-space row to its SOURCE row through the active filter view.
  const srcRow = useCallback((r: number) => (view ? view[r] : r), [view]);

  const onClearRange = useCallback(
    (rect: Rect) => {
      if (view) {
        const rows: number[] = [];
        for (let r = rect.r0; r <= rect.r1 && r < view.length; r++) rows.push(view[r]);
        apply(clearCells(doc, rows, rect.c0, rect.c1));
      } else {
        apply(clearRange(doc, rect.r0, rect.c0, rect.r1, rect.c1));
      }
    },
    [doc, apply, view],
  );

  // Resize is applied live but kept out of the undo stack (a drag would
  // otherwise flood it); the final size still autosaves.
  const onColWidth = useCallback(
    (c: number, width: number) => apply(setColWidth(doc, c, width), { history: false }),
    [doc, apply],
  );
  const onRowHeight = useCallback(
    (r: number, height: number) => apply(setRowHeight(doc, r, height), { history: false }),
    [doc, apply],
  );
  const onAutoSizeCol = useCallback(
    (c: number) => apply(setColWidth(doc, c, autoColWidth(doc, c)), { history: false }),
    [doc, apply],
  );

  // ── Copy / cut (raw values, mapped through the filter view) ────────────────
  const selectionMatrix = useCallback(() => {
    const rect = rectOf(selection);
    const rows: string[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const sr = srcRow(r);
      const row: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) row.push(getCell(doc, sr, c));
      rows.push(row);
    }
    return rows;
  }, [doc, selection, srcRow]);

  const onCopy = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      e.preventDefault();
      void copyMatrix(selectionMatrix());
    },
    [selectionMatrix],
  );
  const onCut = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      e.preventDefault();
      void copyMatrix(selectionMatrix()).then(() => onClearRange(rectOf(selection)));
    },
    [selectionMatrix, onClearRange, selection],
  );

  // ── Structural ops (each is a single undo step) ────────────────────────────
  const doInsertRows = useCallback(
    (at: number, count = 1) => apply(insertRows(doc, at, count)),
    [doc, apply],
  );
  const doDeleteRows = useCallback(
    (at: number, count = 1) => apply(deleteRows(doc, at, count)),
    [doc, apply],
  );
  const doInsertCols = useCallback(
    (at: number, count = 1) => apply(insertCols(doc, at, count)),
    [doc, apply],
  );
  const doDeleteCols = useCallback(
    (at: number, count = 1) => apply(deleteCols(doc, at, count)),
    [doc, apply],
  );

  // ── Sort / type / format / filter ──────────────────────────────────────────
  const applySort = useCallback(
    (col: number, dir: "asc" | "desc", add: boolean) => {
      const next: SortKey[] = add
        ? [...sortSpec.filter((k) => k.col !== col), { col, dir }]
        : [{ col, dir }];
      setSortSpec(next);
      apply(sortDoc(doc, next, locale));
    },
    [doc, apply, locale, sortSpec],
  );
  const clearSort = useCallback(() => setSortSpec([]), []);

  const onSetType = useCallback(
    (col: number, type: ColumnType | null) => apply(setColType(doc, col, type)),
    [doc, apply],
  );
  const onSetFormat = useCallback(
    (col: number, fmt: ColFormat | null) => apply(setColFormat(doc, col, fmt)),
    [doc, apply],
  );
  const onSetFilter = useCallback(
    (col: number, f: ColumnFilter | null) => {
      const others = (doc.filters ?? []).filter((x) => x.col !== col);
      apply(setFilters(doc, f ? [...others, f] : others));
    },
    [doc, apply],
  );

  // Display helpers passed to the grid.
  const formatCell = useCallback(
    (raw: string, c: number) =>
      formatValue(raw, colTypes[c], getColFormat(doc, c) ?? DEFAULT_FORMAT, locale),
    [colTypes, doc, locale],
  );
  const numericCol = useCallback((c: number) => isNumericType(colTypes[c]), [colTypes]);
  const colBadge = useCallback(
    (c: number): ColBadge | null => {
      const sort = sortSpec.find((k) => k.col === c)?.dir;
      const filtered = (doc.filters ?? []).some((f) => f.col === c);
      return sort || filtered ? { sort, filtered } : null;
    },
    [sortSpec, doc.filters],
  );

  // ── Export (Download as… / Copy as…) ───────────────────────────────────────
  const handleExport = useCallback(
    async (targetId: string, mode: "download" | "copy") => {
      const target = EXPORT_TARGETS.find((t) => t.id === targetId);
      if (!target) return;
      const ctx: ExportCtx = {
        doc,
        types: colTypes,
        formats: Array.from({ length: doc.nCols }, (_, c) => getColFormat(doc, c)),
        locale,
      };
      try {
        if (mode === "download") {
          if (target.binary && target.toBlob) {
            downloadBlob(await target.toBlob(ctx), safeFilename(doc.name, target.ext));
          } else if (target.toText) {
            downloadText(target.toText(ctx), safeFilename(doc.name, target.ext), target.mime);
          }
        } else if (target.toText) {
          await navigator.clipboard.writeText(target.toText(ctx));
          showToast(`Copied as ${target.label}`);
        }
      } catch (e) {
        showToast(`Export failed: ${(e as Error).message}`, "error");
      }
    },
    [doc, colTypes, locale, showToast],
  );

  // ── Find & replace ─────────────────────────────────────────────────────────
  const onReplaceOne = useCallback(
    (pos: CellPos, query: string, opts: FindOptions, replacement: string) => {
      const v = doc.cols[pos.c]?.[pos.r] ?? "";
      apply(setCell(doc, pos.r, pos.c, replaceInValue(v, query, replacement, opts)));
    },
    [doc, apply],
  );
  const onReplaceAll = useCallback(
    (query: string, replacement: string, opts: FindOptions): number => {
      const { doc: next, count } = replaceAll(doc, query, replacement, opts);
      if (count) apply(next);
      return count;
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

  const openFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.tsv,.txt,.json,.jsonl,.ndjson,.html,.htm,.md,.markdown,.xlsx,.xls";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (/\.(csv|tsv|txt)$/i.test(file.name) && file.size > STREAM_THRESHOLD) {
        await streamImport(file);
        return;
      }
      try {
        setImportSource(await sourceFromFile(file));
      } catch {
        alert("Could not read that file.");
      }
    };
    input.click();
  }, [streamImport]);

  const newDoc = useCallback(() => {
    if (!confirm("Start a new, empty table? Your current table will be cleared.")) return;
    const fresh = createEmptyDoc();
    setDoc(fresh);
    setSelection(singleCell(0, 0));
    setSortSpec([]);
    history.current.reset(fresh);
    autosaver.current.schedule(fresh);
  }, []);

  // ── Import: bootstrap a fresh doc from the parsed rows ─────────────────────
  const commitImport = useCallback(
    (rows: string[][], hasHeader: boolean) => {
      const baseName =
        doc.name && doc.name !== "Untitled"
          ? doc.name
          : importSource?.filename?.replace(/\.[^.]+$/, "") ?? "Untitled";
      setImportSource(null);
      const fresh = docFromRows(rows, baseName, hasHeader);
      setDoc(fresh);
      setSelection(singleCell(0, 0));
      setSortSpec([]);
      history.current.reset(fresh);
      autosaver.current.schedule(fresh);
    },
    [doc.name, importSource],
  );

  // ── Paste: bootstrap when empty, else paste a block into the selection ─────
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      // While editing a cell, let the input's own paste behaviour win.
      if (document.activeElement?.tagName === "INPUT") return;
      if (!e.clipboardData) return;
      if (isEmptyDoc(doc)) {
        const src = sourceFromClipboard(e.clipboardData);
        if (src) {
          e.preventDefault();
          setImportSource(src);
        }
      } else {
        const block = blockFromClipboard(e.clipboardData);
        if (block && block.length && block.some((r) => r.length)) {
          e.preventDefault();
          const { r0, c0 } = rectOf(selection);
          apply(setBlock(doc, srcRow(r0), c0, block));
        }
      }
    },
    [doc, selection, apply, srcRow],
  );

  // ── Drag & drop file / text import ─────────────────────────────────────────
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dt = e.dataTransfer;
      const file = dt.files[0];
      if (file) {
        if (!isImportableFile(file.name) && !file.type.startsWith("text/")) return;
        if (!isEmptyDoc(doc) && !confirm("Replace the current table with the dropped file?")) return;
        // Big delimited files → stream parse (responsive, page-by-page, progress).
        const lower = file.name.toLowerCase();
        const delimited = /\.(csv|tsv|txt)$/.test(lower);
        if (delimited && file.size > STREAM_THRESHOLD) {
          await streamImport(file);
          return;
        }
        try {
          setImportSource(await sourceFromFile(file));
        } catch {
          alert("Could not read that file.");
        }
        return;
      }
      const text = dt.getData("text/plain");
      if (text) {
        if (!isEmptyDoc(doc) && !confirm("Replace the current table with the dropped text?")) return;
        setImportSource(sourceFromText(text));
      }
    },
    [doc],
  );

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
      } else if (k === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if (e.shiftKey && k === "p") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── Command-palette context ────────────────────────────────────────────────
  const paletteCtx: TableCommandCtx = {
    exportTo: (id, mode) => void handleExport(id, mode),
    sortActive: (dir) => applySort(rectOf(selection).c0, dir, false),
    openFind: () => setFindOpen(true),
    openSettings: () => setSettingsOpen(true),
    newDoc,
    importFile: openFilePicker,
    insertRow: () => doInsertRows(srcRow(rectOf(selection).r0) + 1),
    insertCol: () => doInsertCols(rectOf(selection).c0 + 1),
  };

  // ── Header context-menu items ──────────────────────────────────────────────
  const headerMenuItems = useCallback((): MenuItem[] => {
    if (!headerCtx) return [];
    if (headerCtx.kind === "col") {
      const c = headerCtx.index;
      return [
        { label: "Insert column left", onClick: () => doInsertCols(c) },
        { label: "Insert column right", onClick: () => doInsertCols(c + 1) },
        { label: "Auto-size column", onClick: () => onAutoSizeCol(c) },
        { label: "Delete column", onClick: () => doDeleteCols(c), separator: true, danger: true },
      ];
    }
    const r = headerCtx.index;
    return [
      { label: "Insert row above", onClick: () => doInsertRows(r) },
      { label: "Insert row below", onClick: () => doInsertRows(r + 1) },
      { label: "Reset row height", onClick: () => onRowHeight(r, ROW_HEIGHT) },
      { label: "Delete row", onClick: () => doDeleteRows(r), separator: true, danger: true },
    ];
  }, [headerCtx, doInsertCols, doDeleteCols, doInsertRows, doDeleteRows, onAutoSizeCol, onRowHeight]);

  // Find returns SOURCE positions; map back to a display row when filtered.
  const gotoMatch = useCallback(
    (pos: CellPos) => {
      const dispR = view ? view.indexOf(pos.r) : pos.r;
      if (dispR >= 0) setSelection(singleCell(dispR, pos.c));
    },
    [view],
  );

  // ── Persist settings ───────────────────────────────────────────────────────
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

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
          <button type="button" className={btn} onClick={openFilePicker} title="Import a file">
            <Upload size={12} /> Import
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
          <button type="button" className={btn} onClick={() => setFindOpen(true)} title="Find & replace (Ctrl+F)">
            <Search size={12} /> Find
          </button>
          <ExportMenu
            mode="download"
            label="Download"
            icon={<Download size={12} />}
            onPick={(id) => void handleExport(id, "download")}
          />
          <ExportMenu
            mode="copy"
            label="Copy"
            icon={<Copy size={12} />}
            onPick={(id) => void handleExport(id, "copy")}
          />
          <button type="button" className={btn} onClick={() => setSettingsOpen(true)} title="Settings">
            <Settings size={12} /> Settings
          </button>
        </div>
      </header>

      {/* Grid (drop target + paste/copy/cut root) */}
      <div
        className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border ${
          isDragging ? "border-accent" : "border-border"
        }`}
        onPaste={onPaste}
        onCopy={onCopy}
        onCut={onCut}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
      >
        <Grid
          doc={doc}
          selection={selection}
          onSelectionChange={setSelection}
          onCommitCell={onCommitCell}
          onClearRange={onClearRange}
          onColWidth={onColWidth}
          onRowHeight={onRowHeight}
          onAutoSizeCol={onAutoSizeCol}
          onHeaderContext={setHeaderCtx}
          viewRows={view}
          formatCell={formatCell}
          numericCol={numericCol}
          onColumnMenu={(col, x, y) => setColumnMenu({ col, x, y })}
          colBadge={colBadge}
        />
        {findOpen && (
          <FindReplace
            doc={doc}
            selectionRect={rectOf(selection)}
            onClose={() => setFindOpen(false)}
            onGoto={gotoMatch}
            onReplaceOne={onReplaceOne}
            onReplaceAll={onReplaceAll}
          />
        )}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-bg/70 text-sm text-accent">
            Drop a CSV / TSV / JSON / XLSX / HTML / Markdown file to import
          </div>
        )}
        {isEmptyDoc(doc) && !isDragging && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted">
            Paste tabular data (Ctrl/Cmd+V), drop a file, or just start typing
          </div>
        )}
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

      {importSource && (
        <DetectModal
          source={importSource}
          onCommit={commitImport}
          onCancel={() => setImportSource(null)}
        />
      )}

      {headerCtx && (
        <ContextMenu
          x={headerCtx.x}
          y={headerCtx.y}
          items={headerMenuItems()}
          onClose={() => setHeaderCtx(null)}
        />
      )}

      {columnMenu && (
        <ColumnMenu
          col={columnMenu.col}
          x={columnMenu.x}
          y={columnMenu.y}
          effectiveType={colTypes[columnMenu.col]}
          override={doc.colTypes[columnMenu.col] ?? null}
          format={getColFormat(doc, columnMenu.col)}
          filter={(doc.filters ?? []).find((f) => f.col === columnMenu.col)}
          onSort={(dir, add) => applySort(columnMenu.col, dir, add)}
          onClearSort={clearSort}
          onSetType={(t) => onSetType(columnMenu.col, t)}
          onSetFormat={(f) => onSetFormat(columnMenu.col, f)}
          onSetFilter={(f) => onSetFilter(columnMenu.col, f)}
          onClose={() => setColumnMenu(null)}
        />
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={paletteCtx} />

      {progress && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-accent/40 bg-card px-4 py-2 text-xs text-fg shadow-lg">
          {progress}
        </div>
      )}

      <ToastContainer />
    </section>
  );
}
