/**
 * Virtualised spreadsheet grid.
 *
 * Grid library decision: we deliberately do NOT pull in an opinionated grid
 * (AG-Grid, Handsontable) or even @tanstack/react-virtual. A spreadsheet needs
 * uniform-height rows and variable-width columns — windowing that out by hand is
 * compact, keeps the `/table` chunk tiny (no third-party grid in the bundle),
 * lets us own the theme tokens end-to-end, and sidesteps the licence questions
 * around the big commercial grids. Smoothness comes from native scrolling plus
 * `position: sticky` layers; only the cells inside the viewport (+ overscan) render.
 *
 * Coordinates: the grid works in DISPLAY space. `viewRows` / `viewCols` map a
 * display index to the underlying SOURCE index (filters, hidden rows/cols);
 * null = identity. Frozen rows/cols are the first N display rows/cols, pinned via
 * sticky sibling layers that mirror the header/gutter technique.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type TableDoc,
  getCell,
  colWidth,
  rowHeight,
  colToLabel,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  ROW_HEADER_WIDTH,
} from "~/table/lib/model";
import {
  type Selection,
  type Rect,
  rectOf,
  inRect,
  singleCell,
  clamp,
} from "~/table/lib/selection";

const OVERSCAN = 4;

export interface HeaderContextInfo {
  kind: "col" | "row";
  index: number;
  x: number;
  y: number;
}

export interface ColBadge {
  sort?: "asc" | "desc";
  filtered?: boolean;
}

export interface FillInfo {
  /** Source rect (display coords). */
  src: Rect;
  /** Extended rect (display coords) including the source. */
  dest: Rect;
}

export interface GridProps {
  doc: TableDoc;
  selection: Selection;
  onSelectionChange: (sel: Selection) => void;
  /** SOURCE row, SOURCE col (mapped through the views). */
  onCommitCell: (r: number, c: number, value: string) => void;
  /** DISPLAY-space rect. */
  onClearRange: (rect: Rect) => void;
  /** SOURCE col. */
  onColWidth: (c: number, width: number) => void;
  /** SOURCE row. */
  onRowHeight?: (r: number, height: number) => void;
  onAutoSizeCol?: (c: number) => void;
  onHeaderContext?: (info: HeaderContextInfo) => void;
  viewRows?: number[] | null;
  viewCols?: number[] | null;
  formatCell?: (raw: string, c: number, r: number) => string;
  numericCol?: (c: number) => boolean;
  onColumnMenu?: (c: number, x: number, y: number) => void;
  colBadge?: (c: number) => ColBadge | null;
  /** Fill-handle drag committed (display coords). */
  onFill?: (info: FillInfo) => void;
  /** Frozen pane sizes (display counts). */
  frozenRows?: number;
  frozenCols?: number;
}

interface EditState {
  r: number;
  c: number;
  value: string;
}

export function Grid({
  doc,
  selection,
  onSelectionChange,
  onCommitCell,
  onClearRange,
  onColWidth,
  onRowHeight,
  onAutoSizeCol,
  onHeaderContext,
  viewRows,
  viewCols,
  formatCell,
  numericCol,
  onColumnMenu,
  colBadge,
  onFill,
  frozenRows = 0,
  frozenCols = 0,
}: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const editRef = useRef<EditState | null>(null);
  editRef.current = edit;
  const draggingRef = useRef(false);
  const fillingRef = useRef<Rect | null>(null);
  const [fillDest, setFillDest] = useState<Rect | null>(null);

  // ── Display ↔ source mappings ──────────────────────────────────────────────
  const nDisp = viewRows ? viewRows.length : doc.nRows;
  const nCols = viewCols ? viewCols.length : doc.nCols;
  const sr = (r: number) => (viewRows ? viewRows[r] : r);
  const sc = (c: number) => (viewCols ? viewCols[c] : c);

  const fr = Math.min(frozenRows, nDisp);
  const fc = Math.min(frozenCols, nCols);

  // Cumulative display-col x-offsets (length nCols + 1).
  const colX = useMemo(() => {
    const xs = new Array<number>(nCols + 1);
    xs[0] = 0;
    for (let c = 0; c < nCols; c++) xs[c + 1] = xs[c] + colWidth(doc, sc(c));
    return xs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, viewCols, nCols]);

  // Cumulative display-row y-offsets (length nDisp + 1).
  const rowY = useMemo(() => {
    const ys = new Array<number>(nDisp + 1);
    ys[0] = 0;
    if (!doc.rowHeights && !viewRows) {
      for (let r = 0; r <= nDisp; r++) ys[r] = r * ROW_HEIGHT;
    } else {
      for (let r = 0; r < nDisp; r++) ys[r + 1] = ys[r] + rowHeight(doc, sr(r));
    }
    return ys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, viewRows, nDisp]);

  const totalW = colX[nCols];
  const totalH = rowY[nDisp];
  const frozenW = colX[fc];
  const frozenH = rowY[fr];

  // ── Viewport size ──────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Visible window (binary search over the offset arrays) ──────────────────
  const rowAt = (y: number) => {
    let lo = 0, hi = nDisp;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rowY[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, nDisp - 1);
  };
  // Visible body window, kept past the frozen panes.
  const r0 = Math.max(fr, rowAt(scroll.top + frozenH) - OVERSCAN);
  const r1 = Math.min(nDisp - 1, rowAt(scroll.top + viewport.h) + OVERSCAN);

  let c0 = fc;
  while (c0 < nCols - 1 && colX[c0 + 1] <= scroll.left - ROW_HEADER_WIDTH + frozenW) c0++;
  c0 = Math.max(fc, c0 - OVERSCAN);
  let c1 = c0;
  while (c1 < nCols - 1 && colX[c1] < scroll.left - ROW_HEADER_WIDTH + viewport.w) c1++;
  c1 = Math.min(nCols - 1, c1 + OVERSCAN);

  const rect = rectOf(selection);

  // ── Editing ────────────────────────────────────────────────────────────────
  const beginEdit = (r: number, c: number, initial?: string) =>
    setEdit({ r, c, value: initial ?? getCell(doc, sr(r), sc(c)) });

  useEffect(() => {
    if (edit && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [edit]);

  const commitEdit = (move?: { dr: number; dc: number }) => {
    const e = editRef.current;
    if (!e) return;
    editRef.current = null;
    onCommitCell(sr(e.r), sc(e.c), e.value);
    setEdit(null);
    if (move) moveActive(move.dr, move.dc, false);
    scrollRef.current?.focus();
  };

  const cancelEdit = () => {
    setEdit(null);
    scrollRef.current?.focus();
  };

  // ── Movement ────────────────────────────────────────────────────────────────
  const moveActive = (dr: number, dc: number, extend: boolean) => {
    const f = selection.focus;
    const r = clamp(f.r + dr, 0, nDisp - 1);
    const c = clamp(f.c + dc, 0, nCols - 1);
    onSelectionChange(extend ? { anchor: selection.anchor, focus: { r, c } } : singleCell(r, c));
    scrollIntoView(r, c);
  };

  const scrollIntoView = (r: number, c: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = rowY[r], bottom = rowY[r + 1], left = colX[c], right = colX[c + 1];
    const vTop = el.scrollTop, vBottom = vTop + el.clientHeight - HEADER_HEIGHT;
    const vLeft = el.scrollLeft, vRight = vLeft + el.clientWidth - ROW_HEADER_WIDTH;
    if (r >= fr) {
      if (top < vTop + frozenH) el.scrollTop = top - frozenH;
      else if (bottom > vBottom) el.scrollTop = bottom - (el.clientHeight - HEADER_HEIGHT);
    }
    if (c >= fc) {
      if (left < vLeft + frozenW) el.scrollLeft = left - frozenW;
      else if (right > vRight) el.scrollLeft = right - (el.clientWidth - ROW_HEADER_WIDTH);
    }
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (edit) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelectionChange({ anchor: { r: 0, c: 0 }, focus: { r: nDisp - 1, c: nCols - 1 } });
      return;
    }
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); moveActive(-1, 0, e.shiftKey); return;
      case "ArrowDown": e.preventDefault(); moveActive(1, 0, e.shiftKey); return;
      case "Enter": e.preventDefault(); moveActive(1, 0, false); return;
      case "ArrowLeft": e.preventDefault(); moveActive(0, -1, e.shiftKey); return;
      case "ArrowRight": e.preventDefault(); moveActive(0, 1, e.shiftKey); return;
      case "Tab": e.preventDefault(); moveActive(0, e.shiftKey ? -1 : 1, false); return;
      case "Home": e.preventDefault(); moveActive(0, -nCols, e.shiftKey); return;
      case "End": e.preventDefault(); moveActive(0, nCols, e.shiftKey); return;
      case "PageDown": e.preventDefault(); moveActive(Math.floor(viewport.h / ROW_HEIGHT), 0, e.shiftKey); return;
      case "PageUp": e.preventDefault(); moveActive(-Math.floor(viewport.h / ROW_HEIGHT), 0, e.shiftKey); return;
      case "Delete": case "Backspace": e.preventDefault(); onClearRange(rect); return;
      case "F2": e.preventDefault(); beginEdit(selection.focus.r, selection.focus.c); return;
      case "Escape": return;
    }
    if (!mod && e.key.length === 1) {
      e.preventDefault();
      beginEdit(selection.focus.r, selection.focus.c, e.key);
    }
  };

  // ── Pointer selection ────────────────────────────────────────────────────
  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    if (e.button !== 0) return;
    scrollRef.current?.focus();
    onSelectionChange(e.shiftKey ? { anchor: selection.anchor, focus: { r, c } } : singleCell(r, c));
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onCellPointerEnter = (r: number, c: number) => {
    const src = fillingRef.current;
    if (src) {
      // Extend the fill rect along the dominant axis from the source.
      const downDist = Math.max(0, r - src.r1);
      const rightDist = Math.max(0, c - src.c1);
      setFillDest(
        downDist >= rightDist
          ? { ...src, r1: Math.max(src.r1, r) }
          : { ...src, c1: Math.max(src.c1, c) },
      );
      return;
    }
    if (draggingRef.current) onSelectionChange({ anchor: selection.anchor, focus: { r, c } });
  };

  const onPointerUp = () => {
    draggingRef.current = false;
    const src = fillingRef.current;
    if (src) {
      fillingRef.current = null;
      const d = fillDest;
      setFillDest(null);
      if (d && onFill && (d.r1 > src.r1 || d.c1 > src.c1)) onFill({ src, dest: d });
    }
  };

  // ── Fill handle ─────────────────────────────────────────────────────────────
  const startFill = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fillingRef.current = rect;
    setFillDest(rect);
  };

  // ── Cell renderer ──────────────────────────────────────────────────────────
  const renderCell = (r: number, c: number) => {
    const selected = inRect(rect, r, c);
    const inFill = fillDest ? inRect(fillDest, r, c) : false;
    const isFocus = selection.focus.r === r && selection.focus.c === c;
    const editing = edit?.r === r && edit?.c === c;
    const raw = getCell(doc, sr(r), sc(c));
    const h = rowHeight(doc, sr(r));
    return (
      <div
        key={`${r}:${c}`}
        onPointerDown={(e) => onCellPointerDown(e, r, c)}
        onPointerEnter={() => onCellPointerEnter(r, c)}
        onDoubleClick={() => beginEdit(r, c)}
        className={`absolute box-border overflow-hidden whitespace-nowrap border-b border-r border-border px-1.5 text-sm ${
          numericCol?.(sc(c)) ? "text-right tabular-nums" : ""
        } ${selected || inFill ? "bg-accent/10" : "bg-bg"} ${
          isFocus ? "z-[1] outline outline-2 -outline-offset-2 outline-accent" : ""
        }`}
        style={{
          top: HEADER_HEIGHT + rowY[r],
          left: ROW_HEADER_WIDTH + colX[c],
          width: colWidth(doc, sc(c)),
          height: h,
          lineHeight: `${h - 2}px`,
        }}
      >
        {editing ? null : formatCell ? formatCell(raw, sc(c), sr(r)) : raw}
      </div>
    );
  };

  // Fill handle — a standalone overlay at the selection's bottom-right corner so
  // it isn't clipped by the cell's overflow-hidden.
  const fillHandle =
    onFill && !edit && rect.r1 < nDisp && rect.c1 < nCols ? (
      <div
        onPointerDown={startFill}
        className="absolute z-[5] h-2 w-2 cursor-crosshair border border-bg bg-accent"
        style={{
          top: HEADER_HEIGHT + rowY[rect.r1 + 1] - 4,
          left: ROW_HEADER_WIDTH + colX[rect.c1 + 1] - 4,
        }}
      />
    ) : null;

  // Body cells (excluding frozen panes — those render in the sticky layers).
  const cells: React.ReactNode[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push(renderCell(r, c));

  // Frozen row band (display rows < fr), excluding frozen-col overlap.
  const frozenRowCells: React.ReactNode[] = [];
  if (fr > 0) for (let r = 0; r < fr; r++) for (let c = c0; c <= c1; c++) frozenRowCells.push(renderCell(r, c));
  // Frozen col band (display cols < fc), excluding frozen-row overlap.
  const frozenColCells: React.ReactNode[] = [];
  if (fc > 0) for (let r = r0; r <= r1; r++) for (let c = 0; c < fc; c++) frozenColCells.push(renderCell(r, c));
  // Frozen corner.
  const frozenCornerCells: React.ReactNode[] = [];
  if (fr > 0 && fc > 0) for (let r = 0; r < fr; r++) for (let c = 0; c < fc; c++) frozenCornerCells.push(renderCell(r, c));

  // ── Column headers ───────────────────────────────────────────────────────
  const colHeader = (c: number) => {
    const active = c >= rect.c0 && c <= rect.c1;
    const badge = colBadge?.(sc(c));
    return (
      <div
        key={c}
        onPointerDown={(e) => onHeaderSelect(e, "col", c)}
        onContextMenu={(e) => { e.preventDefault(); onHeaderContext?.({ kind: "col", index: sc(c), x: e.clientX, y: e.clientY }); }}
        className={`group absolute box-border flex cursor-pointer items-center justify-center gap-0.5 border-b border-r border-border text-xs font-medium ${
          active ? "bg-accent/20 text-fg" : "bg-card text-muted"
        }`}
        style={{ left: ROW_HEADER_WIDTH + colX[c], top: 0, width: colWidth(doc, sc(c)), height: HEADER_HEIGHT }}
      >
        <span>{colToLabel(sc(c))}</span>
        {badge?.sort && <span className="text-accent">{badge.sort === "asc" ? "▲" : "▼"}</span>}
        {badge?.filtered && <span className="text-accent" title="Filtered">⏷</span>}
        {onColumnMenu && (
          <button
            type="button"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); onColumnMenu(sc(c), b.left, b.bottom); }}
            className="absolute right-2 text-muted opacity-0 group-hover:opacity-100 hover:text-accent"
            aria-label={`Column ${colToLabel(sc(c))} menu`}
          >▾</button>
        )}
        <div
          onPointerDown={(e) => startColResize(e, c)}
          onDoubleClick={(e) => { e.stopPropagation(); onAutoSizeCol?.(sc(c)); }}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent"
        />
      </div>
    );
  };
  const colHeaders: React.ReactNode[] = [];
  for (let c = c0; c <= c1; c++) colHeaders.push(colHeader(c));
  const frozenColHeaders: React.ReactNode[] = [];
  for (let c = 0; c < fc; c++) frozenColHeaders.push(colHeader(c));

  // ── Row headers ───────────────────────────────────────────────────────────
  const rowHeader = (r: number) => {
    const srr = sr(r);
    const active = r >= rect.r0 && r <= rect.r1;
    return (
      <div
        key={r}
        onPointerDown={(e) => onHeaderSelect(e, "row", r)}
        onContextMenu={(e) => { e.preventDefault(); onHeaderContext?.({ kind: "row", index: srr, x: e.clientX, y: e.clientY }); }}
        className={`absolute box-border flex cursor-pointer items-center justify-center border-b border-r border-border text-xs ${
          active ? "bg-accent/20 text-fg" : "bg-card text-muted"
        }`}
        style={{ top: HEADER_HEIGHT + rowY[r], left: 0, width: ROW_HEADER_WIDTH, height: rowHeight(doc, srr) }}
      >
        {srr + 1}
        {onRowHeight && (
          <div
            onPointerDown={(e) => startRowResize(e, srr)}
            onDoubleClick={(e) => { e.stopPropagation(); onRowHeight(srr, ROW_HEIGHT); }}
            className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize hover:bg-accent"
          />
        )}
      </div>
    );
  };
  const rowHeaders: React.ReactNode[] = [];
  for (let r = r0; r <= r1; r++) rowHeaders.push(rowHeader(r));
  const frozenRowHeaders: React.ReactNode[] = [];
  for (let r = 0; r < fr; r++) frozenRowHeaders.push(rowHeader(r));

  function onHeaderSelect(e: React.PointerEvent, kind: "col" | "row", index: number) {
    if (e.button !== 0) return;
    scrollRef.current?.focus();
    if (kind === "col") onSelectionChange({ anchor: { r: 0, c: index }, focus: { r: nDisp - 1, c: index } });
    else onSelectionChange({ anchor: { r: index, c: 0 }, focus: { r: index, c: nCols - 1 } });
  }

  function startColResize(e: React.PointerEvent, c: number) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = colWidth(doc, sc(c));
    const move = (ev: PointerEvent) => onColWidth(sc(c), startW + (ev.clientX - startX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function startRowResize(e: React.PointerEvent, srcR: number) {
    if (!onRowHeight) return;
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY, startH = rowHeight(doc, srcR);
    const move = (ev: PointerEvent) => onRowHeight(srcR, startH + (ev.clientY - startY));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
      onKeyDown={onKeyDown}
      onPointerUp={onPointerUp}
      className="relative h-full w-full overflow-auto bg-bg outline-none [scrollbar-width:thin]"
    >
      <div className="relative" style={{ width: ROW_HEADER_WIDTH + totalW, height: HEADER_HEIGHT + totalH }}>
        {cells}
        {fillHandle}

        {edit && (
          <input
            ref={inputRef}
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit({ dr: 1, dc: 0 }); }
              else if (e.key === "Tab") { e.preventDefault(); commitEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
              else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              e.stopPropagation();
            }}
            onBlur={() => commitEdit()}
            className="absolute z-[25] box-border border-2 border-accent bg-bg px-1.5 text-sm outline-none"
            style={{ top: HEADER_HEIGHT + rowY[edit.r], left: ROW_HEADER_WIDTH + colX[edit.c], width: colWidth(doc, sc(edit.c)), height: rowHeight(doc, sr(edit.r)) }}
          />
        )}

        {/* Frozen column band (sticky left) */}
        {fc > 0 && <div className="sticky left-0 z-10" style={{ width: 0 }}>{frozenColCells}</div>}
        {/* Frozen row band (sticky top) */}
        {fr > 0 && <div className="sticky top-0 z-[11]" style={{ height: 0 }}>{frozenRowCells}</div>}
        {/* Frozen corner (sticky top-left) */}
        {fr > 0 && fc > 0 && <div className="sticky left-0 top-0 z-[12]" style={{ width: 0, height: 0 }}>{frozenCornerCells}</div>}

        {/* Column header strip (sticky top) */}
        <div className="sticky top-0 z-20" style={{ height: 0 }}>{colHeaders}</div>
        {/* Frozen-column headers (sticky top-left, above the strip) */}
        {fc > 0 && <div className="sticky left-0 top-0 z-[22]" style={{ width: 0, height: 0 }}>{frozenColHeaders}</div>}

        {/* Row-number gutter (sticky left) */}
        <div className="sticky left-0 z-20" style={{ width: 0 }}>{rowHeaders}</div>
        {/* Frozen-row gutter (sticky top-left) */}
        {fr > 0 && <div className="sticky left-0 top-0 z-[22]" style={{ width: 0, height: 0 }}>{frozenRowHeaders}</div>}

        {/* Top-left corner */}
        <div className="sticky left-0 top-0 z-30 box-border border-b border-r border-border bg-card" style={{ width: ROW_HEADER_WIDTH, height: HEADER_HEIGHT }} />
      </div>
    </div>
  );
}
