/**
 * Per-column menu (opened from the ▾ in a column header): sort, type override,
 * number format, and a filter builder.
 */
import { useEffect, useRef, useState } from "react";
import type { ColumnType } from "~/table/lib/model";
import {
  type ColFormat,
  type NumberStyle,
  TYPE_LABELS,
  DEFAULT_FORMAT,
  isNumericType,
} from "~/table/lib/coltypes";
import {
  type ColumnFilter,
  type FilterOp,
  FILTER_OP_LABELS,
} from "~/table/lib/filter";

interface ColumnMenuProps {
  col: number;
  x: number;
  y: number;
  effectiveType: ColumnType;
  override: ColumnType | null;
  format: ColFormat | null;
  filter: ColumnFilter | undefined;
  onSort: (dir: "asc" | "desc", add: boolean) => void;
  onClearSort: () => void;
  onSetType: (type: ColumnType | null) => void;
  onSetFormat: (fmt: ColFormat | null) => void;
  onSetFilter: (filter: ColumnFilter | null) => void;
  onClose: () => void;
}

const STYLES: NumberStyle[] = ["auto", "plain", "thousands", "percent", "currency", "scientific"];
const OPS: FilterOp[] = ["contains", "eq", "neq", "gt", "lt", "between", "empty", "notEmpty"];

export function ColumnMenu({
  col,
  x,
  y,
  effectiveType,
  override,
  format,
  filter,
  onSort,
  onClearSort,
  onSetType,
  onSetFormat,
  onSetFilter,
  onClose,
}: ColumnMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [op, setOp] = useState<FilterOp>(filter?.op ?? "contains");
  const [val, setVal] = useState(filter?.value ?? "");
  const [val2, setVal2] = useState(filter?.value2 ?? "");

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const fmt = format ?? DEFAULT_FORMAT;
  const numeric = isNumericType(effectiveType);
  const needsValue = op !== "empty" && op !== "notEmpty";
  const item = "block w-full rounded px-2 py-1 text-left text-xs hover:bg-border";
  const ctl = "rounded border border-border bg-card px-1.5 py-0.5 text-xs";

  return (
    <div
      ref={ref}
      className="fixed z-50 w-60 rounded-lg border border-border bg-bg p-2 text-xs shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 360) }}
    >
      <div className="mb-1 flex flex-col">
        <button type="button" className={item} onClick={() => { onSort("asc", false); onClose(); }}>↑ Sort ascending</button>
        <button type="button" className={item} onClick={() => { onSort("desc", false); onClose(); }}>↓ Sort descending</button>
        <button type="button" className={item} onClick={() => { onSort("asc", true); onClose(); }}>＋ Add to sort ↑</button>
        <button type="button" className={item} onClick={() => { onSort("desc", true); onClose(); }}>＋ Add to sort ↓</button>
        <button type="button" className={item} onClick={() => { onClearSort(); onClose(); }}>Clear sort</button>
      </div>

      <div className="my-1 h-px bg-border" />

      <label className="flex items-center justify-between py-1">
        <span className="text-muted">Type</span>
        <select
          className={ctl}
          value={override ?? "auto"}
          onChange={(e) => onSetType(e.target.value === "auto" ? null : (e.target.value as ColumnType))}
        >
          <option value="auto">Auto ({TYPE_LABELS[effectiveType]})</option>
          {(Object.keys(TYPE_LABELS) as ColumnType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>

      {numeric && (
        <>
          <label className="flex items-center justify-between py-1">
            <span className="text-muted">Format</span>
            <select
              className={ctl}
              value={fmt.style}
              onChange={(e) => onSetFormat({ ...fmt, style: e.target.value as NumberStyle })}
            >
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between py-1">
            <span className="text-muted">Decimals</span>
            <input
              type="number"
              min={0}
              max={10}
              className={`${ctl} w-16`}
              value={fmt.decimals ?? ""}
              placeholder="auto"
              onChange={(e) =>
                onSetFormat({ ...fmt, decimals: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </label>
          {fmt.style === "currency" && (
            <label className="flex items-center justify-between py-1">
              <span className="text-muted">Currency</span>
              <input
                className={`${ctl} w-20`}
                value={fmt.currency}
                onChange={(e) => onSetFormat({ ...fmt, currency: e.target.value.toUpperCase() })}
              />
            </label>
          )}
        </>
      )}

      <div className="my-1 h-px bg-border" />

      {/* Filter builder */}
      <div className="flex flex-col gap-1">
        <span className="text-muted">Filter</span>
        <select className={ctl} value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
          {OPS.map((o) => (
            <option key={o} value={o}>{FILTER_OP_LABELS[o]}</option>
          ))}
        </select>
        {needsValue && (
          <input
            className={ctl}
            placeholder="value"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSetFilter({ col, op, value: val, value2: val2 });
                onClose();
              }
            }}
          />
        )}
        {op === "between" && (
          <input className={ctl} placeholder="and" value={val2} onChange={(e) => setVal2(e.target.value)} />
        )}
        <div className="flex gap-1">
          <button
            type="button"
            className="flex-1 rounded border border-accent bg-accent/20 px-2 py-1 text-accent hover:bg-accent/30"
            onClick={() => {
              onSetFilter({ col, op, value: val, value2: val2 });
              onClose();
            }}
          >
            Apply
          </button>
          {filter && (
            <button
              type="button"
              className="flex-1 rounded border border-border bg-card px-2 py-1 hover:border-accent"
              onClick={() => {
                onSetFilter(null);
                onClose();
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
