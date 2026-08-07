/**
 * FieldsWorkspace — the Form fields mode workspace.
 *
 * Same shape as {@link AnnotateWorkspace}: a large page canvas with its own
 * toolbar, page navigation, zoom, undo/redo and an options sidebar
 * ({@link FieldsPanel}). Field drafts live on `doc.fields` — hand-placed and
 * auto-detected alike — and become real AcroForm widgets only when the user
 * hits Apply.
 *
 * Manual placement and detection share one pending layer on purpose: a
 * detection is just a draft someone else drew for you, and it can be nudged,
 * renamed, retyped or deleted exactly like your own.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2, Type, CheckSquare, CircleDot, ChevronDown, List, Hand,
  Undo2, Redo2, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Check,
} from "lucide-react";
import { FieldCanvas, type FieldTool } from "~/pdf/ui/FieldCanvas";
import { FieldsPanel } from "~/pdf/ui/panels/FieldsPanel";
import { getPageBoxes, viewSize, type PageBox } from "~/pdf/lib/annotate";
import { listFormFields } from "~/pdf/lib/forms";
import {
  clampRect, fieldId, slugifyFieldName, uniqueFieldName,
  DEFAULT_FIELD_STYLE,
  type FieldDraft, type FieldRect, type FieldStyle,
} from "~/pdf/lib/form-fields";
import {
  detectFields, inferLabel, overlapRatio, type PageSignals,
} from "~/pdf/lib/detect-fields";
import { readDocSignals } from "~/pdf/lib/page-signals";
import { setFields, type OpenDoc } from "~/pdf/lib/state";

const MAX_HISTORY = 100;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const TOOLS: { id: FieldTool; label: string; icon: React.ReactNode; key: string }[] = [
  { id: "select",   label: "Select",   icon: <MousePointer2 size={15} aria-hidden />, key: "v" },
  { id: "text",     label: "Text",     icon: <Type size={15} aria-hidden />,          key: "t" },
  { id: "checkbox", label: "Checkbox", icon: <CheckSquare size={15} aria-hidden />,   key: "c" },
  { id: "radio",    label: "Radio",    icon: <CircleDot size={15} aria-hidden />,     key: "r" },
  { id: "dropdown", label: "Dropdown", icon: <ChevronDown size={15} aria-hidden />,   key: "d" },
  { id: "options",  label: "List",     icon: <List size={15} aria-hidden />,          key: "l" },
  { id: "hand",     label: "Pan",      icon: <Hand size={15} aria-hidden />,          key: "h" },
];

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onUpdateDoc: (id: string, updater: (d: OpenDoc) => OpenDoc) => void;
  /** Write the pending fields into the document. */
  onApply: (style: FieldStyle) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function FieldsWorkspace({ doc, busy, onUpdateDoc, onApply, onToast }: Props) {
  const [tool, setTool] = useState<FieldTool>("text");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<PageBox[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [past, setPast] = useState<FieldDraft[][]>([]);
  const [future, setFuture] = useState<FieldDraft[][]>([]);
  const [style, setStyle] = useState<FieldStyle>(DEFAULT_FIELD_STYLE);
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Per-page text/vector signals, cached per doc revision. */
  const signalCache = useRef(new Map<string, PageSignals>());
  useEffect(() => { signalCache.current.clear(); }, [doc.id, doc.rev]);

  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  // Page geometry (CropBox + rotation) drives both the canvas and the write.
  useEffect(() => {
    let alive = true;
    setBoxes(null);
    getPageBoxes(doc.bytes)
      .then((b) => { if (alive) setBoxes(b); })
      .catch((e) => {
        if (alive) toastRef.current(`Couldn't read page sizes: ${(e as Error).message}`, "error");
      });
    return () => { alive = false; };
  }, [doc.id, doc.rev, doc.bytes]);

  // Names already in the document — new fields must not collide with them.
  useEffect(() => {
    let alive = true;
    listFormFields(doc.bytes)
      .then((f) => { if (alive) setExistingNames(f.map((x) => x.name)); })
      .catch(() => { if (alive) setExistingNames([]); });
    return () => { alive = false; };
  }, [doc.id, doc.rev, doc.bytes]);

  useEffect(() => {
    setPage(0);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
  }, [doc.id]);

  useEffect(() => {
    if (page >= doc.pageCount) setPage(Math.max(0, doc.pageCount - 1));
  }, [page, doc.pageCount]);

  const box = boxes?.[Math.min(page, (boxes?.length ?? 1) - 1)] ?? null;

  useEffect(() => {
    if (zoom !== null || !box) return;
    const avail = scrollRef.current?.clientWidth ?? 900;
    const view = viewSize(box);
    setZoom(Math.max(0.35, Math.min(1.5, (avail - 32) / Math.max(1, view.width))));
  }, [zoom, box]);

  // Read the current page's signals in the background: detection needs them,
  // and so does naming a hand-placed field after its nearest label.
  useEffect(() => {
    let alive = true;
    const key = `${doc.rev}:${page}`;
    if (signalCache.current.has(key)) return;
    readDocSignals(doc.id, doc.rev, doc.bytes, [page], doc.password)
      .then(([s]) => { if (alive && s) signalCache.current.set(key, s); })
      .catch(() => { /* naming falls back to "field" — not worth a toast */ });
    return () => { alive = false; };
  }, [doc.id, doc.rev, doc.bytes, doc.password, page]);

  // ── Field layer + history ─────────────────────────────────────────────────
  const commit = useCallback((next: FieldDraft[]) => {
    setPast((p) => [...p, doc.fields].slice(-MAX_HISTORY));
    setFuture([]);
    onUpdateDoc(doc.id, (d) => setFields(d, next));
  }, [doc.fields, doc.id, onUpdateDoc]);

  const takenNames = useCallback(
    (except?: string) => new Set([
      ...existingNames,
      ...doc.fields.filter((f) => f.id !== except).map((f) => f.name),
    ]),
    [existingNames, doc.fields],
  );

  const addField = useCallback((rect: FieldRect) => {
    if (tool === "select" || tool === "hand") return;
    const signals = signalCache.current.get(`${doc.rev}:${page}`);
    const label = signals ? inferLabel(rect, signals.texts, 190) : null;
    const name = uniqueFieldName(slugifyFieldName(label ?? "field"), takenNames());
    const draft: FieldDraft = {
      id: fieldId(),
      page,
      kind: tool,
      name,
      x: round2(rect.x), y: round2(rect.y), w: round2(rect.w), h: round2(rect.h),
      source: "manual",
      status: "placed",
      label,
      ...(tool === "radio" ? { option: "option_1" } : {}),
      ...(tool === "dropdown" || tool === "options" ? { options: [] } : {}),
    };
    commit([...doc.fields, draft]);
    setSelectedId(draft.id);
  }, [commit, doc.fields, doc.rev, page, takenNames, tool]);

  /**
   * Edit one draft. `history: false` skips the undo snapshot — typing a name is
   * a stream of edits, and one history entry per keystroke would evict
   * everything that actually matters from a 100-deep stack.
   */
  const patchField = useCallback((
    id: string,
    patch: Partial<FieldDraft>,
    opts: { history?: boolean } = {},
  ) => {
    const next = doc.fields.map((f) => (f.id === id
      ? { ...f, ...patch, status: patch.status ?? (f.status === "proposed" ? "placed" : f.status) }
      : f));
    if (opts.history === false) onUpdateDoc(doc.id, (d) => setFields(d, next));
    else commit(next);
  }, [commit, doc.fields, doc.id, onUpdateDoc]);

  const setGeometry = useCallback((id: string, rect: FieldRect) => {
    patchField(id, {
      x: round2(rect.x), y: round2(rect.y), w: round2(rect.w), h: round2(rect.h),
    });
  }, [patchField]);

  const deleteFields = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    commit(doc.fields.filter((f) => !drop.has(f.id)));
    setSelectedId((cur) => (cur && drop.has(cur) ? null : cur));
  }, [commit, doc.fields]);

  const acceptFields = useCallback((ids: string[]) => {
    const accept = new Set(ids);
    commit(doc.fields.map((f) => (accept.has(f.id) ? { ...f, status: "placed" } : f)));
  }, [commit, doc.fields]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    setPast(past.slice(0, -1));
    setFuture([doc.fields, ...future].slice(0, MAX_HISTORY));
    onUpdateDoc(doc.id, (d) => setFields(d, prev));
  }, [past, future, doc.fields, doc.id, onUpdateDoc]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0]!;
    setFuture(future.slice(1));
    setPast([...past, doc.fields].slice(-MAX_HISTORY));
    onUpdateDoc(doc.id, (d) => setFields(d, next));
  }, [past, future, doc.fields, doc.id, onUpdateDoc]);

  // ── Detection ─────────────────────────────────────────────────────────────
  const detect = useCallback(async (scope: "page" | "document") => {
    if (detecting) return;
    setDetecting(true);
    try {
      const pages = scope === "page"
        ? [page]
        : Array.from({ length: doc.pageCount }, (_, i) => i);
      const signals = await readDocSignals(doc.id, doc.rev, doc.bytes, pages, doc.password);
      for (const s of signals) signalCache.current.set(`${doc.rev}:${s.page}`, s);

      const { fields: found } = detectFields(
        signals, {}, [...existingNames, ...doc.fields.map((f) => f.name)],
      );
      // Re-running detection shouldn't stack duplicates on top of what's
      // already pending (placed by hand or proposed by an earlier run).
      const fresh = found.filter((c) => !doc.fields.some(
        (f) => f.page === c.page && overlapRatio(f, c) > 0.5,
      ));
      if (fresh.length === 0) {
        onToast(
          signals.some((s) => s.rules.length + s.texts.length > 0)
            ? "No new fields found — no underlines or underscore runs left to turn into fields"
            : "Nothing to detect on this page (a scanned image has no text or vector lines)",
        );
        return;
      }
      commit([...doc.fields, ...fresh]);
      setSelectedId(fresh[0]!.id);
      onToast(`Proposed ${fresh.length} field${fresh.length === 1 ? "" : "s"} — review, then Apply`);
    } catch (e) {
      onToast(`Detection failed: ${(e as Error).message}`, "error");
    } finally {
      setDetecting(false);
    }
  }, [commit, detecting, doc, existingNames, onToast, page]);

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  const selected = useMemo(
    () => doc.fields.find((f) => f.id === selectedId) ?? null,
    [doc.fields, selectedId],
  );
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod) return;
      if (e.key === " ") {
        if (t && (t.tagName === "BUTTON" || t.tagName === "A" || t.tagName === "SELECT")) return;
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      const sel = selectedRef.current;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        deleteFields([sel.id]);
        return;
      }
      if (e.key === "Escape") { setSelectedId(null); return; }
      if (sel && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = (e.key === "ArrowRight" ? step : 0) - (e.key === "ArrowLeft" ? step : 0);
        const dy = (e.key === "ArrowDown" ? step : 0) - (e.key === "ArrowUp" ? step : 0);
        const b = boxRef.current;
        const view = b ? viewSize(b) : { width: Infinity, height: Infinity };
        // Alt resizes instead of moving — the same gesture every editor uses.
        const next = e.altKey
          ? { x: sel.x, y: sel.y, w: Math.max(4, sel.w + dx), h: Math.max(4, sel.h + dy) }
          : { x: sel.x + dx, y: sel.y + dy, w: sel.w, h: sel.h };
        setGeometry(sel.id, clampRect(next, view.width, view.height));
        return;
      }
      if (e.key === "[") { e.preventDefault(); setPage((p) => Math.max(0, p - 1)); return; }
      if (e.key === "]") { e.preventDefault(); setPage((p) => Math.min(doc.pageCount - 1, p + 1)); return; }
      const hit = TOOLS.find((it) => it.key === e.key.toLowerCase());
      if (hit) { e.preventDefault(); setTool(hit.id); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") setSpaceHeld(false); };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [undo, redo, deleteFields, setGeometry, doc.pageCount]);

  const pan = useCallback((dx: number, dy: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft += dx;
    el.scrollTop += dy;
  }, []);

  const pageFields = useMemo(
    () => doc.fields.filter((f) => f.page === page),
    [doc.fields, page],
  );
  const pending = doc.fields.length;
  const zoomIndex = ZOOMS.findIndex((z) => Math.abs(z - (zoom ?? 1)) < 0.001);

  const apply = async () => {
    if (pending === 0) return;
    await onApply(style);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <div className="flex flex-wrap items-center gap-1">
          {TOOLS.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setTool(it.id)}
              title={`${it.label} (${it.key})`}
              aria-pressed={tool === it.id}
              className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs transition ${
                tool === it.id ? "bg-accent/15 text-accent" : "text-muted hover:bg-bg hover:text-fg"
              }`}
            >
              {it.icon}
              <span className="hidden xl:inline">{it.label}</span>
            </button>
          ))}
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={past.length === 0}
                  title="Undo (Ctrl-Z)"
                  className="rounded p-1.5 text-muted hover:bg-bg hover:text-fg disabled:opacity-30">
            <Undo2 size={15} />
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0}
                  title="Redo (Ctrl-Shift-Z)"
                  className="rounded p-1.5 text-muted hover:bg-bg hover:text-fg disabled:opacity-30">
            <Redo2 size={15} />
          </button>
          <button type="button" onClick={() => deleteFields(doc.fields.map((f) => f.id))}
                  disabled={pending === 0}
                  title="Discard all unapplied fields"
                  className="rounded p-1.5 text-muted hover:bg-bg hover:text-fg disabled:opacity-30">
            <Trash2 size={15} />
          </button>
        </div>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <div className="flex items-center gap-1 text-xs text-muted">
          <button type="button" disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                  className="rounded p-1 hover:bg-bg hover:text-fg disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <span className="font-mono">{page + 1} / {doc.pageCount}</span>
          <button type="button" disabled={page >= doc.pageCount - 1}
                  onClick={() => setPage((p) => Math.min(doc.pageCount - 1, p + 1))}
                  aria-label="Next page"
                  className="rounded p-1 hover:bg-bg hover:text-fg disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted">
          <button type="button" aria-label="Zoom out"
                  onClick={() => setZoom((z) => ZOOMS[Math.max(0, (zoomIndex < 0 ? 2 : zoomIndex) - 1)] ?? z)}
                  className="rounded p-1 hover:bg-bg hover:text-fg">
            <ZoomOut size={15} />
          </button>
          <span className="w-10 text-center font-mono">{Math.round((zoom ?? 1) * 100)}%</span>
          <button type="button" aria-label="Zoom in"
                  onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, (zoomIndex < 0 ? 2 : zoomIndex) + 1)] ?? z)}
                  className="rounded p-1 hover:bg-bg hover:text-fg">
            <ZoomIn size={15} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">
            {pending === 0
              ? "No fields pending"
              : `${pending} field${pending === 1 ? "" : "s"} (${pageFields.length} on this page)`}
          </span>
          <button
            type="button"
            disabled={busy || pending === 0}
            onClick={apply}
            title="Create these fields in the document's AcroForm"
            className="flex items-center gap-1 rounded border border-accent bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            <Check size={14} aria-hidden /> Apply fields
          </button>
        </div>
      </div>

      {/* Canvas + options */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div
          ref={scrollRef}
          className="flex min-h-[60vh] min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-bg p-4"
        >
          {box && zoom !== null ? (
            <div className="m-auto">
              <FieldCanvas
                doc={doc}
                page={page}
                box={box}
                zoom={zoom}
                tool={tool}
                fields={pageFields}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDraw={addField}
                onGeometry={setGeometry}
                panMode={tool === "hand" || spaceHeld}
                onPan={pan}
              />
            </div>
          ) : (
            <div className="m-auto text-sm text-muted">Preparing page…</div>
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-3 lg:w-72">
          <FieldsPanel
            fields={doc.fields}
            page={page}
            pageCount={doc.pageCount}
            selectedId={selectedId}
            detecting={detecting}
            existingNames={existingNames}
            style={style}
            onStyle={(patch) => setStyle((s) => ({ ...s, ...patch }))}
            onSelect={setSelectedId}
            onGoToPage={setPage}
            onPatch={patchField}
            onDelete={deleteFields}
            onAccept={acceptFields}
            onDetect={detect}
          />
        </aside>
      </div>

      <p className="text-xs text-muted">
        Drag to place · click a field to select · drag its handles to resize ·
        arrows nudge (Alt resizes) · Delete removes · hold Space to pan.
        {existingNames.length > 0 && ` This document already has ${existingNames.length} field${existingNames.length === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
