/**
 * Right-rail insight panel: conditional formatting rules, manual cell colour
 * tagging, and a live column summary for the focused column.
 */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { TableDoc } from "~/table/lib/model";
import { type CondRule, validateExpr } from "~/table/lib/condformat";
import { summarize } from "~/table/lib/summary";
import { colToLabel } from "~/table/lib/model";
import type { Rect } from "~/table/lib/selection";

const SWATCHES = ["#fca5a5", "#fdba74", "#fde047", "#86efac", "#7dd3fc", "#c4b5fd", "#f9a8d4", ""];

interface InsightPanelProps {
  doc: TableDoc;
  rect: Rect;
  onClose: () => void;
  onAddRule: (rule: CondRule) => void;
  onRemoveRule: (index: number) => void;
  onSetCellColor: (color: string | null) => void;
}

export function InsightPanel({ doc, rect, onClose, onAddRule, onRemoveRule, onSetCellColor }: InsightPanelProps) {
  const [tab, setTab] = useState<"format" | "summary">("format");
  const [kind, setKind] = useState<"colorScale" | "dataBar" | "custom">("colorScale");
  const [expr, setExpr] = useState("x > 0");
  const summary = useMemo(() => summarize(doc, rect.c0), [doc, rect.c0]);
  const rules = doc.condFormats ?? [];
  const exprError = kind === "custom" ? validateExpr(expr) : null;

  const addRule = () => {
    if (kind === "colorScale") onAddRule({ kind: "colorScale", range: rect, stops: 3, colors: ["#fca5a5", "#fde047", "#86efac"] });
    else if (kind === "dataBar") onAddRule({ kind: "dataBar", range: rect, color: "#2dd4a8" });
    else if (!exprError) onAddRule({ kind: "custom", range: rect, expr, color: "#7dd3fc" });
  };

  const num = (n?: number) => (n === undefined ? "—" : (Math.round(n * 1000) / 1000).toLocaleString());

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l border-border bg-bg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1 text-xs">
          <button type="button" onClick={() => setTab("format")} className={`rounded px-2 py-0.5 ${tab === "format" ? "bg-accent/20 text-accent" : "text-muted"}`}>Format</button>
          <button type="button" onClick={() => setTab("summary")} className={`rounded px-2 py-0.5 ${tab === "summary" ? "bg-accent/20 text-accent" : "text-muted"}`}>Summary</button>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-border hover:text-fg"><X size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {tab === "format" ? (
          <>
            <p className="mb-1 text-muted">Cell colour (selection)</p>
            <div className="mb-3 flex flex-wrap gap-1">
              {SWATCHES.map((s) => (
                <button
                  key={s || "none"}
                  type="button"
                  title={s || "Clear"}
                  onClick={() => onSetCellColor(s || null)}
                  className="h-5 w-5 rounded border border-border"
                  style={{ background: s || "transparent" }}
                >
                  {!s && <span className="text-[10px] text-muted">⌀</span>}
                </button>
              ))}
            </div>

            <p className="mb-1 text-muted">Conditional formatting</p>
            <div className="mb-2 flex flex-col gap-1">
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded border border-border bg-card px-1.5 py-0.5">
                <option value="colorScale">Colour scale (3-stop)</option>
                <option value="dataBar">Data bars</option>
                <option value="custom">Custom expression</option>
              </select>
              {kind === "custom" && (
                <>
                  <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="x > 100" className="rounded border border-border bg-card px-1.5 py-0.5 font-mono" />
                  {exprError && <span className="text-red-400">{exprError}</span>}
                </>
              )}
              <button type="button" onClick={addRule} disabled={!!exprError} className="rounded border border-accent bg-accent/20 px-2 py-1 text-accent hover:bg-accent/30 disabled:opacity-40">
                Add rule for {colToLabel(rect.c0)}{rect.r0 + 1}:{colToLabel(rect.c1)}{rect.r1 + 1}
              </button>
            </div>

            <ul className="flex flex-col gap-1">
              {rules.map((rule, i) => (
                <li key={i} className="flex items-center justify-between rounded border border-border bg-card px-2 py-1">
                  <span className="truncate">
                    {rule.kind === "custom" ? `if ${rule.expr}` : rule.kind === "dataBar" ? "Data bars" : "Colour scale"}{" "}
                    <span className="text-muted">{colToLabel(rule.range.c0)}{rule.range.r0 + 1}:{colToLabel(rule.range.c1)}{rule.range.r1 + 1}</span>
                  </span>
                  <button type="button" onClick={() => onRemoveRule(i)} className="ml-1 text-muted hover:text-red-400"><X size={12} /></button>
                </li>
              ))}
              {rules.length === 0 && <li className="text-muted">No rules yet.</li>}
            </ul>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="col-span-2 mb-1 font-medium text-fg">Column {colToLabel(rect.c0)}</dt>
            <Stat k="Count" v={summary.count.toLocaleString()} />
            <Stat k="Distinct" v={summary.distinct.toLocaleString()} />
            <Stat k="Nulls" v={summary.nulls.toLocaleString()} />
            {summary.numeric && <>
              <Stat k="Min" v={num(summary.min)} />
              <Stat k="Max" v={num(summary.max)} />
              <Stat k="Mean" v={num(summary.mean)} />
              <Stat k="Median" v={num(summary.median)} />
              <Stat k="p25" v={num(summary.p25)} />
              <Stat k="p75" v={num(summary.p75)} />
            </>}
            <dt className="col-span-2 mt-2 font-medium text-fg">Top values</dt>
            {summary.top.map((t) => (
              <div key={t.value} className="col-span-2 flex justify-between">
                <span className="truncate text-muted">{t.value || "(empty)"}</span>
                <span>{t.count}</span>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </>
  );
}
