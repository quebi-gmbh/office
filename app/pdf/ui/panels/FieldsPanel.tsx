/**
 * FieldsPanel — the options sidebar for Form fields mode.
 *
 * Three sections: auto-detection (the entry point + what it found), the
 * properties of the selected field, and the review list of everything pending
 * on the document. Detection results land in the same pending layer as
 * hand-placed fields, so the list is where you accept, rename, retype or drop
 * a proposal before it's written.
 */
import { useMemo } from "react";
import { Trash2, Check, Wand2, MousePointerSquareDashed } from "lucide-react";
import {
  DEFAULT_FIELD_STYLE, type DraftFieldKind, type FieldDraft, type FieldStyle,
} from "~/pdf/lib/form-fields";
import { FIELD_COLORS } from "~/pdf/ui/FieldCanvas";

const KIND_LABELS: Record<DraftFieldKind, string> = {
  text: "Text field",
  checkbox: "Checkbox",
  radio: "Radio button",
  dropdown: "Dropdown",
  options: "List box",
};

const SOURCE_LABELS: Record<FieldDraft["source"], string> = {
  manual: "placed",
  rule: "line",
  underscore: "underscores",
};

type Props = {
  fields: FieldDraft[];
  page: number;
  pageCount: number;
  selectedId: string | null;
  detecting: boolean;
  /** AcroForm field names already in the document (so we can warn on clashes). */
  existingNames: string[];
  style: FieldStyle;
  onStyle: (patch: Partial<FieldStyle>) => void;
  onSelect: (id: string | null) => void;
  onGoToPage: (page: number) => void;
  onPatch: (
    id: string,
    patch: Partial<FieldDraft>,
    opts?: { history?: boolean },
  ) => void;
  onDelete: (ids: string[]) => void;
  onAccept: (ids: string[]) => void;
  onDetect: (scope: "page" | "document") => void;
};

export function FieldsPanel({
  fields, page, pageCount, selectedId, detecting, existingNames, style, onStyle,
  onSelect, onGoToPage, onPatch, onDelete, onAccept, onDetect,
}: Props) {
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const proposed = useMemo(() => fields.filter((f) => f.status === "proposed"), [fields]);
  const taken = useMemo(() => new Set(existingNames), [existingNames]);

  const duplicateName = selected
    ? fields.some((f) => f.id !== selected.id && f.name === selected.name && f.kind !== "radio") ||
      taken.has(selected.name)
    : false;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* ── Detect ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Detect fields
        </h3>
        <p className="text-xs text-muted">
          Proposes a text field for every underline and underscore run. Nothing is
          written until you hit Apply — review, nudge or delete first.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={detecting}
            onClick={() => onDetect("page")}
            className="flex items-center gap-1 rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            <Wand2 size={13} aria-hidden /> This page
          </button>
          <button
            type="button"
            disabled={detecting || pageCount <= 1}
            onClick={() => onDetect("document")}
            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-40"
          >
            All {pageCount} pages
          </button>
        </div>
        {detecting && <p className="text-xs text-muted">Reading the page…</p>}
        {proposed.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-700">
              {proposed.length} proposal{proposed.length === 1 ? "" : "s"} to review
            </span>
            <button
              type="button"
              onClick={() => onAccept(proposed.map((f) => f.id))}
              className="rounded px-1.5 py-0.5 text-accent hover:bg-accent/10"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => onDelete(proposed.map((f) => f.id))}
              className="rounded px-1.5 py-0.5 text-muted hover:bg-bg hover:text-fg"
            >
              Discard
            </button>
          </div>
        )}
      </section>

      {/* ── Selected field ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Field properties
        </h3>
        {!selected ? (
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <MousePointerSquareDashed size={14} className="mt-0.5 shrink-0" aria-hidden />
            Drag on the page to place a field, or click one to edit it.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Name</span>
              <input
                type="text"
                value={selected.name}
                onChange={(e) => onPatch(selected.id, { name: e.target.value }, { history: false })}
                className={`rounded border bg-bg px-2 py-1 font-mono text-xs ${
                  duplicateName ? "border-amber-500" : "border-border"
                }`}
              />
              {duplicateName && (
                <span className="text-xs text-amber-700">
                  Name already used — it will be renamed on apply.
                </span>
              )}
              {selected.label && (
                <span className="text-xs text-muted">from label “{selected.label}”</span>
              )}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Type</span>
              <select
                value={selected.kind}
                onChange={(e) => onPatch(selected.id, { kind: e.target.value as DraftFieldKind })}
                className="rounded border border-border bg-bg px-2 py-1"
              >
                {(Object.keys(KIND_LABELS) as DraftFieldKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>

            {(selected.kind === "dropdown" || selected.kind === "options") && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Choices (one per line)</span>
                <textarea
                  rows={3}
                  value={(selected.options ?? []).join("\n")}
                  onChange={(e) => onPatch(selected.id, {
                    options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  }, { history: false })}
                  className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
                />
              </label>
            )}

            {selected.kind === "radio" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Export value</span>
                <input
                  type="text"
                  value={selected.option ?? ""}
                  placeholder="e.g. yes"
                  onChange={(e) => onPatch(selected.id, { option: e.target.value }, { history: false })}
                  className="rounded border border-border bg-bg px-2 py-1 font-mono text-xs"
                />
                <span className="text-xs text-muted">
                  Buttons sharing a name form one group; give each a different value.
                </span>
              </label>
            )}

            {selected.kind !== "radio" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {selected.kind === "checkbox" ? "Initially" : "Initial value"}
                </span>
                {selected.kind === "checkbox" ? (
                  <select
                    value={selected.value === "true" ? "true" : "false"}
                    onChange={(e) => onPatch(selected.id, { value: e.target.value })}
                    className="rounded border border-border bg-bg px-2 py-1"
                  >
                    <option value="false">Unchecked</option>
                    <option value="true">Checked</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selected.value ?? ""}
                    onChange={(e) => onPatch(selected.id, { value: e.target.value }, { history: false })}
                    className="rounded border border-border bg-bg px-2 py-1"
                  />
                )}
              </label>
            )}

            <div className="flex flex-wrap gap-3 text-xs">
              {selected.kind === "text" && (
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!selected.multiline}
                    onChange={(e) => onPatch(selected.id, { multiline: e.target.checked })}
                    className="accent-accent"
                  />
                  Multiline
                </label>
              )}
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!selected.required}
                  onChange={(e) => onPatch(selected.id, { required: e.target.checked })}
                  className="accent-accent"
                />
                Required
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!selected.readOnly}
                  onChange={(e) => onPatch(selected.id, { readOnly: e.target.checked })}
                  className="accent-accent"
                />
                Read-only
              </label>
            </div>

            {/* Numeric nudge — placing is a drag, but fine alignment is easier typed. */}
            <div className="grid grid-cols-4 gap-1">
              {(["x", "y", "w", "h"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-0.5">
                  <span className="text-xs uppercase text-muted">{k}</span>
                  <input
                    type="number"
                    step={1}
                    value={Math.round(selected[k] * 10) / 10}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) onPatch(selected.id, { [k]: n } as Partial<FieldDraft>);
                    }}
                    className="w-full rounded border border-border bg-bg px-1 py-0.5 text-xs"
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              {selected.status === "proposed" && (
                <button
                  type="button"
                  onClick={() => onAccept([selected.id])}
                  className="flex items-center gap-1 rounded border border-accent bg-accent/15 px-2 py-1 text-xs text-accent hover:bg-accent/25"
                >
                  <Check size={13} aria-hidden /> Accept
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete([selected.id])}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted hover:border-red-400 hover:text-red-600"
              >
                <Trash2 size={13} aria-hidden /> Delete
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Review list ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
          <span>Pending fields ({fields.length})</span>
          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => onDelete(fields.map((f) => f.id))}
              className="font-normal normal-case tracking-normal text-muted hover:text-red-600"
            >
              Clear all
            </button>
          )}
        </h3>
        {fields.length === 0 ? (
          <p className="text-xs text-muted">Nothing pending yet.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
            {fields.map((f, i) => (
              <li key={f.id}>
                <div
                  className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-xs ${
                    f.id === selectedId ? "border-accent bg-accent/10" : "border-border bg-card"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => { onGoToPage(f.page); onSelect(f.id); }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    title={`${KIND_LABELS[f.kind]} · page ${f.page + 1} · ${SOURCE_LABELS[f.source]}`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: FIELD_COLORS[f.kind] }}
                      aria-hidden
                    />
                    <span className="truncate font-mono">{f.name}</span>
                    {f.status === "proposed" && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1 text-amber-700">?</span>
                    )}
                    <span className="ml-auto shrink-0 text-muted">
                      {f.page + 1 === page + 1 ? `#${i + 1}` : `p${f.page + 1}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete([f.id])}
                    aria-label={`Delete ${f.name}`}
                    className="shrink-0 rounded p-0.5 text-muted hover:bg-bg hover:text-red-600"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Tab order follows this list — the order fields were placed or detected
          (reading order for detections).
        </p>
      </section>

      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Appearance
        </h3>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span>Border width</span>
          <input
            type="number"
            min={0}
            max={4}
            step={0.5}
            value={style.borderWidth}
            onChange={(e) => onStyle({ borderWidth: Math.max(0, Number(e.target.value) || 0) })}
            className="w-16 rounded border border-border bg-bg px-1 py-0.5"
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span>Border colour</span>
          <input
            type="color"
            value={style.borderColor ?? DEFAULT_FIELD_STYLE.borderColor ?? "#9ca3af"}
            onChange={(e) => onStyle({ borderColor: e.target.value })}
            className="h-6 w-10 rounded border border-border bg-bg"
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span>Fill background</span>
          <span className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={style.backgroundColor !== null}
              onChange={(e) => onStyle({ backgroundColor: e.target.checked ? "#eef2ff" : null })}
              className="accent-accent"
            />
            {style.backgroundColor !== null && (
              <input
                type="color"
                value={style.backgroundColor}
                onChange={(e) => onStyle({ backgroundColor: e.target.value })}
                className="h-6 w-10 rounded border border-border bg-bg"
              />
            )}
          </span>
        </label>
        <p className="text-xs text-muted">
          A transparent background keeps the printed line visible underneath.
        </p>
      </section>
    </div>
  );
}
