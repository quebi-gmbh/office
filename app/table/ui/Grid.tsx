/**
 * Virtualised spreadsheet grid.
 *
 * Grid library decision: we deliberately do NOT pull in an opinionated grid
 * (AG-Grid, Handsontable) or even @tanstack/react-virtual. A spreadsheet needs
 * uniform-height rows and variable-width columns — windowing that out by hand is
 * ~100 lines, keeps the `/table` chunk tiny (no third-party grid in the bundle),
 * lets us own the theme tokens end-to-end, and sidesteps the licence questions
 * around the big commercial grids. Smoothness comes from native scrolling plus
 * `position: sticky` headers; only the cells inside the viewport (+ a small
 * overscan) are ever rendered.
 *
 * Layout: one scroll container holds a relatively-positioned sizer of the full
 * content size so the scrollbars are honest. Body cells are absolutely
 * positioned at their real coordinates so they scroll natively. The column-
 * header strip and the row-number gutter are sticky siblings that only render
 * the headers currently in view.
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

export interface GridProps {
  doc: TableDoc;
  selection: Selection;
  onSelectionChange: (sel: Selection) => void;
  onCommitCell: (r: number, c: number, value: string) => void;
  onClearRange: (rect: Rect) => void;
  onColWidth: (c: number, width: number) => void;
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
}: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const editRef = useRef<EditState | null>(null);
  editRef.current = edit;
  const draggingRef = useRef(false);

  // Cumulative column x-offsets (length nCols + 1).
  const colX = useMemo(() => {
    const xs = new Array<number>(doc.nCols + 1);
    xs[0] = 0;
    for (let c = 0; c < doc.nCols; c++) xs[c + 1] = xs[c] + colWidth(doc, c);
    return xs;
  }, [doc]);

  const totalW = colX[doc.nCols];
  const totalH = doc.nRows * ROW_HEIGHT;

  // ── Track viewport size ──────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () =>
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Visible ranges ─────────────────────────────────────────────────────────
  const r0 = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - OVERSCAN);
  const r1 = Math.min(
    doc.nRows - 1,
    Math.ceil((scroll.top + viewport.h) / ROW_HEIGHT) + OVERSCAN,
  );

  let c0 = 0;
  while (c0 < doc.nCols - 1 && colX[c0 + 1] <= scroll.left - ROW_HEADER_WIDTH)
    c0++;
  c0 = Math.max(0, c0 - OVERSCAN);
  let c1 = c0;
  while (
    c1 < doc.nCols - 1 &&
    colX[c1] < scroll.left - ROW_HEADER_WIDTH + viewport.w
  )
    c1++;
  c1 = Math.min(doc.nCols - 1, c1 + OVERSCAN);

  const rect = rectOf(selection);

  // ── Editing ──────────────────────────────────────────────────────────────
  const beginEdit = (r: number, c: number, initial?: string) => {
    setEdit({ r, c, value: initial ?? getCell(doc, r, c) });
  };

  useEffect(() => {
    if (edit && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      // Place caret at the end when seeding from the existing value.
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [edit]);

  const commitEdit = (move?: { dr: number; dc: number }) => {
    // Read+consume via the ref so the input's onBlur (which fires on unmount,
    // right after an Enter/Tab commit) can't record a second, duplicate edit.
    const e = editRef.current;
    if (!e) return;
    editRef.current = null;
    onCommitCell(e.r, e.c, e.value);
    setEdit(null);
    if (move) moveActive(move.dr, move.dc, false);
    scrollRef.current?.focus();
  };

  const cancelEdit = () => {
    setEdit(null);
    scrollRef.current?.focus();
  };

  // ── Selection movement ─────────────────────────────────────────────────────
  const moveActive = (dr: number, dc: number, extend: boolean) => {
    const f = selection.focus;
    const r = clamp(f.r + dr, 0, doc.nRows - 1);
    const c = clamp(f.c + dc, 0, doc.nCols - 1);
    const next: Selection = extend
      ? { anchor: selection.anchor, focus: { r, c } }
      : singleCell(r, c);
    onSelectionChange(next);
    scrollIntoView(r, c);
  };

  const scrollIntoView = (r: number, c: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cellTop = r * ROW_HEIGHT;
    const cellLeft = colX[c];
    const cellRight = colX[c + 1];
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight - HEADER_HEIGHT;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth - ROW_HEADER_WIDTH;
    if (cellTop < viewTop) el.scrollTop = cellTop;
    else if (cellTop + ROW_HEIGHT > viewBottom)
      el.scrollTop = cellTop + ROW_HEIGHT - (el.clientHeight - HEADER_HEIGHT);
    if (cellLeft < viewLeft) el.scrollLeft = cellLeft;
    else if (cellRight > viewRight)
      el.scrollLeft = cellRight - (el.clientWidth - ROW_HEADER_WIDTH);
  };

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (edit) return; // input handles its own keys
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelectionChange({
        anchor: { r: 0, c: 0 },
        focus: { r: doc.nRows - 1, c: doc.nCols - 1 },
      });
      return;
    }
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1, 0, e.shiftKey);
        return;
      case "ArrowDown":
      case "Enter":
        e.preventDefault();
        moveActive(1, 0, e.shiftKey && e.key !== "Enter");
        return;
      case "ArrowLeft":
        e.preventDefault();
        moveActive(0, -1, e.shiftKey);
        return;
      case "ArrowRight":
        e.preventDefault();
        moveActive(0, 1, e.shiftKey);
        return;
      case "Tab":
        e.preventDefault();
        moveActive(0, e.shiftKey ? -1 : 1, false);
        return;
      case "Home":
        e.preventDefault();
        moveActive(0, -doc.nCols, e.shiftKey);
        return;
      case "End":
        e.preventDefault();
        moveActive(0, doc.nCols, e.shiftKey);
        return;
      case "PageDown":
        e.preventDefault();
        moveActive(Math.floor(viewport.h / ROW_HEIGHT), 0, e.shiftKey);
        return;
      case "PageUp":
        e.preventDefault();
        moveActive(-Math.floor(viewport.h / ROW_HEIGHT), 0, e.shiftKey);
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        onClearRange(rect);
        return;
      case "F2":
        e.preventDefault();
        beginEdit(selection.focus.r, selection.focus.c);
        return;
      case "Escape":
        return;
    }
    // Printable character → start editing, replacing the cell.
    if (!mod && e.key.length === 1) {
      e.preventDefault();
      beginEdit(selection.focus.r, selection.focus.c, e.key);
    }
  };

  // ── Pointer selection ────────────────────────────────────────────────────
  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    if (e.button !== 0) return;
    scrollRef.current?.focus();
    if (e.shiftKey) {
      onSelectionChange({ anchor: selection.anchor, focus: { r, c } });
    } else {
      onSelectionChange(singleCell(r, c));
    }
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onCellPointerEnter = (r: number, c: number) => {
    if (draggingRef.current) {
      onSelectionChange({ anchor: selection.anchor, focus: { r, c } });
    }
  };

  const onPointerUp = () => {
    draggingRef.current = false;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const cells: React.ReactNode[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const selected = inRect(rect, r, c);
      const isFocus = selection.focus.r === r && selection.focus.c === c;
      const editing = edit?.r === r && edit?.c === c;
      cells.push(
        <div
          key={`${r}:${c}`}
          onPointerDown={(e) => onCellPointerDown(e, r, c)}
          onPointerEnter={() => onCellPointerEnter(r, c)}
          onDoubleClick={() => beginEdit(r, c)}
          className={`absolute box-border overflow-hidden whitespace-nowrap border-b border-r border-border px-1.5 text-sm leading-[26px] ${
            selected ? "bg-accent/10" : ""
          } ${isFocus ? "z-[1] outline outline-2 -outline-offset-2 outline-accent" : ""}`}
          style={{
            top: HEADER_HEIGHT + r * ROW_HEIGHT,
            left: ROW_HEADER_WIDTH + colX[c],
            width: colWidth(doc, c),
            height: ROW_HEIGHT,
          }}
        >
          {editing ? null : getCell(doc, r, c)}
        </div>,
      );
    }
  }

  // Column headers (sticky top).
  const colHeaders: React.ReactNode[] = [];
  for (let c = c0; c <= c1; c++) {
    const active = c >= rect.c0 && c <= rect.c1;
    colHeaders.push(
      <div
        key={c}
        className={`absolute box-border flex items-center justify-center border-b border-r border-border text-xs font-medium ${
          active ? "bg-accent/20 text-fg" : "bg-card text-muted"
        }`}
        style={{
          left: ROW_HEADER_WIDTH + colX[c],
          top: 0,
          width: colWidth(doc, c),
          height: HEADER_HEIGHT,
        }}
      >
        {colToLabel(c)}
        <div
          onPointerDown={(e) => startColResize(e, c)}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent"
        />
      </div>,
    );
  }

  // Row headers (sticky left).
  const rowHeaders: React.ReactNode[] = [];
  for (let r = r0; r <= r1; r++) {
    const active = r >= rect.r0 && r <= rect.r1;
    rowHeaders.push(
      <div
        key={r}
        className={`absolute box-border flex items-center justify-center border-b border-r border-border text-xs ${
          active ? "bg-accent/20 text-fg" : "bg-card text-muted"
        }`}
        style={{
          top: HEADER_HEIGHT + r * ROW_HEIGHT,
          left: 0,
          width: ROW_HEADER_WIDTH,
          height: ROW_HEIGHT,
        }}
      >
        {r + 1}
      </div>,
    );
  }

  // ── Column resize ──────────────────────────────────────────────────────────
  function startColResize(e: React.PointerEvent, c: number) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidth(doc, c);
    const move = (ev: PointerEvent) => {
      onColWidth(c, startW + (ev.clientX - startX));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onScroll={(e) =>
        setScroll({
          top: e.currentTarget.scrollTop,
          left: e.currentTarget.scrollLeft,
        })
      }
      onKeyDown={onKeyDown}
      onPointerUp={onPointerUp}
      className="relative h-full w-full overflow-auto bg-bg outline-none [scrollbar-width:thin]"
    >
      {/* Sizer establishes the full scroll extent. */}
      <div
        className="relative"
        style={{
          width: ROW_HEADER_WIDTH + totalW,
          height: HEADER_HEIGHT + totalH,
        }}
      >
        {/* Body cells */}
        {cells}

        {/* Edit input (over the active cell) */}
        {edit && (
          <input
            ref={inputRef}
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit({ dr: 1, dc: 0 });
              } else if (e.key === "Tab") {
                e.preventDefault();
                commitEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 });
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
              e.stopPropagation();
            }}
            onBlur={() => commitEdit()}
            className="absolute z-10 box-border border-2 border-accent bg-bg px-1.5 text-sm leading-[24px] outline-none"
            style={{
              top: HEADER_HEIGHT + edit.r * ROW_HEIGHT,
              left: ROW_HEADER_WIDTH + colX[edit.c],
              width: colWidth(doc, edit.c),
              height: ROW_HEIGHT,
            }}
          />
        )}

        {/* Column header strip (sticky top) */}
        <div
          className="sticky top-0 z-20"
          style={{ height: 0 }}
        >
          {colHeaders}
        </div>

        {/* Row-number gutter (sticky left) */}
        <div className="sticky left-0 z-20" style={{ width: 0 }}>
          {rowHeaders}
        </div>

        {/* Top-left corner */}
        <div
          className="sticky left-0 top-0 z-30 box-border border-b border-r border-border bg-card"
          style={{ width: ROW_HEADER_WIDTH, height: HEADER_HEIGHT }}
        />
      </div>
    </div>
  );
}
