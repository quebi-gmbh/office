/**
 * Import preview modal. Shows the detected format, a first-20-rows preview, and
 * manual overrides (delimiter, quote, first-row-is-header) for delimited text.
 * Committing hands the final rows + header flag back to the caller.
 *
 * Locale-sensitive options (encoding, decimal / thousands separators) belong to
 * the type layer and arrive in phase 1.4; here we cover the structural overrides
 * that change how the text is split into a grid.
 */
import { useMemo, useState } from "react";
import {
  type Detection,
  type TableFormat,
  FORMAT_LABELS,
  reparseDelimited,
} from "~/lib/table/detect";

export interface ImportSource {
  /** Raw text (delimited / json / html / markdown / code). */
  text?: string;
  /** Pre-parsed rows (xlsx, or any non-text source). */
  detection: Detection;
  filename?: string;
}

interface DetectModalProps {
  source: ImportSource;
  onCommit: (rows: string[][], hasHeader: boolean) => void;
  onCancel: () => void;
}

const DELIMS: { label: string; value: string }[] = [
  { label: "Comma  ,", value: "," },
  { label: "Tab  \\t", value: "\t" },
  { label: "Semicolon  ;", value: ";" },
  { label: "Pipe  |", value: "|" },
];

const isDelimited = (f: TableFormat) =>
  f === "csv" || f === "tsv" || f === "delimited";

export function DetectModal({ source, onCommit, onCancel }: DetectModalProps) {
  const [delimiter, setDelimiter] = useState(source.detection.delimiter ?? ",");
  const [quote, setQuote] = useState(source.detection.quote ?? '"');
  const [hasHeader, setHasHeader] = useState(source.detection.hasHeader);

  const delimited = isDelimited(source.detection.format) && source.text != null;

  // Re-derive rows whenever an override changes (delimited only).
  const detection = useMemo<Detection>(() => {
    if (delimited && source.text != null) {
      return reparseDelimited(source.text, { delimiter, quote, hasHeader });
    }
    return { ...source.detection, hasHeader };
  }, [delimited, source.text, source.detection, delimiter, quote, hasHeader]);

  const rows = detection.rows;
  const preview = rows.slice(0, 20);
  const nCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const empty = rows.length === 0 || (rows.length === 1 && rows[0].every((c) => c === ""));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">
            Import preview —{" "}
            <span className="text-accent">{FORMAT_LABELS[detection.format]}</span>
          </h2>
          <span className="text-xs text-muted">
            {rows.length.toLocaleString()} rows × {nCols} cols
          </span>
        </header>

        {/* Overrides */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-xs">
          {delimited && (
            <>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">Delimiter</span>
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  className="rounded border border-border bg-card px-1.5 py-0.5"
                >
                  {DELIMS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">Quote</span>
                <select
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  className="rounded border border-border bg-card px-1.5 py-0.5"
                >
                  <option value='"'>Double "</option>
                  <option value="'">Single '</option>
                </select>
              </label>
            </>
          )}
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="accent-accent"
            />
            <span>First row is a header</span>
          </label>
        </div>

        {/* Preview */}
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {empty ? (
            <p className="p-4 text-center text-sm text-muted">
              Nothing to import — the input did not parse into any rows. Try a
              different delimiter.
            </p>
          ) : (
            <table className="border-collapse text-xs">
              <tbody>
                {preview.map((row, r) => (
                  <tr key={r}>
                    {Array.from({ length: nCols }).map((_, c) => {
                      const isHeaderCell = hasHeader && r === 0;
                      return (
                        <td
                          key={c}
                          className={`max-w-[200px] truncate border border-border px-2 py-1 ${
                            isHeaderCell ? "bg-card font-semibold text-fg" : "text-muted"
                          }`}
                        >
                          {row[c] ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > 20 && (
            <p className="px-2 py-1 text-xs text-muted">
              … and {(rows.length - 20).toLocaleString()} more rows
            </p>
          )}
        </div>

        {/* Actions */}
        <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border bg-card px-3 py-1.5 text-xs hover:border-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={empty}
            onClick={() => onCommit(rows, hasHeader)}
            className="rounded border border-accent bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 disabled:opacity-40"
          >
            Import {rows.length.toLocaleString()} rows
          </button>
        </footer>
      </div>
    </div>
  );
}
