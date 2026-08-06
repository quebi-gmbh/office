/**
 * AnnotateWorkspace — the Draw mode workspace.
 *
 * Picking "Draw" in the operation rail swaps the usual thumbnails + panel +
 * preview layout for this: a large page canvas with its own toolbar, page
 * navigation, zoom, undo/redo, and the {@link DrawPanel} options sidebar.
 *
 * Ink lives on `doc.annots` (so it survives page switches and panel swaps) and
 * is burned into the bytes only when the user hits Apply. Undo/redo is a pair
 * of snapshot stacks over that layer, scoped to this workspace.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Highlighter, Eraser, Minus, ArrowUpRight, Square, Circle, Type,
  Signature as SignatureIcon, Undo2, Redo2, ZoomIn, ZoomOut, Check, Trash2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { AnnotateCanvas, type DrawStyle } from "~/pdf/ui/AnnotateCanvas";
import { DrawPanel, HIGHLIGHTS } from "~/pdf/ui/panels/DrawPanel";
import { getPageBoxes, type Annotation, type AnnotTool, type PageBox } from "~/pdf/lib/annotate";
import { loadSignatures, type StoredSignature } from "~/pdf/lib/signatures";
import { setAnnots, type OpenDoc } from "~/pdf/lib/state";

const MAX_HISTORY = 100;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const TOOLS: { id: AnnotTool; label: string; icon: React.ReactNode; key: string }[] = [
  { id: "pen",         label: "Pen",         icon: <Pencil size={15} aria-hidden />,        key: "p" },
  { id: "highlighter", label: "Highlighter", icon: <Highlighter size={15} aria-hidden />,   key: "h" },
  { id: "eraser",      label: "Eraser",      icon: <Eraser size={15} aria-hidden />,        key: "e" },
  { id: "line",        label: "Line",        icon: <Minus size={15} aria-hidden />,         key: "l" },
  { id: "arrow",       label: "Arrow",       icon: <ArrowUpRight size={15} aria-hidden />,  key: "a" },
  { id: "rect",        label: "Rectangle",   icon: <Square size={15} aria-hidden />,        key: "r" },
  { id: "ellipse",     label: "Ellipse",     icon: <Circle size={15} aria-hidden />,        key: "o" },
  { id: "text",        label: "Text",        icon: <Type size={15} aria-hidden />,          key: "t" },
  { id: "signature",   label: "Signature",   icon: <SignatureIcon size={15} aria-hidden />, key: "s" },
];

const DEFAULT_STYLE: DrawStyle = {
  color: "#111827",
  width: 2.5,
  opacity: 1,
  fill: null,
  textSize: 14,
  eraserSize: 8,
  signatureWidth: 160,
};

type Props = {
  doc: OpenDoc;
  busy: boolean;
  onUpdateDoc: (id: string, updater: (d: OpenDoc) => OpenDoc) => void;
  /** Burn the current layer into the bytes. */
  onApply: () => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

export function AnnotateWorkspace({ doc, busy, onUpdateDoc, onApply, onToast }: Props) {
  const [tool, setTool] = useState<AnnotTool>("pen");
  const [style, setStyle] = useState<DrawStyle>(DEFAULT_STYLE);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<PageBox[] | null>(null);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [signatures, setSignatures] = useState<StoredSignature[]>([]);
  const [sigId, setSigId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stored signatures are browser-local; read them once on mount.
  useEffect(() => {
    const list = loadSignatures();
    setSignatures(list);
    setSigId((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  // Page geometry (CropBox + rotation) drives both the canvas and the burn.
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
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

  // Reset per-document view state.
  useEffect(() => {
    setPage(0);
    setPast([]);
    setFuture([]);
  }, [doc.id]);

  useEffect(() => {
    if (page >= doc.pageCount) setPage(Math.max(0, doc.pageCount - 1));
  }, [page, doc.pageCount]);

  const box = boxes?.[Math.min(page, (boxes?.length ?? 1) - 1)] ?? null;

  // First render: fit the page to the available width (never upscaling past 1.5×).
  useEffect(() => {
    if (zoom !== null || !box) return;
    const avail = scrollRef.current?.clientWidth ?? 900;
    const view = box.rotation === 90 || box.rotation === 270 ? box.height : box.width;
    setZoom(Math.max(0.35, Math.min(1.5, (avail - 32) / Math.max(1, view))));
  }, [zoom, box]);

  // ── Annotation layer + history ────────────────────────────────────────────
  const commit = useCallback((next: Annotation[]) => {
    setPast((p) => [...p, doc.annots].slice(-MAX_HISTORY));
    setFuture([]);
    onUpdateDoc(doc.id, (d) => setAnnots(d, next));
  }, [doc.annots, doc.id, onUpdateDoc]);

  const addAnnotation = useCallback((a: Annotation) => {
    commit([...doc.annots, a]);
  }, [commit, doc.annots]);

  const eraseIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    const next = doc.annots.filter((a) => !drop.has(a.id));
    if (next.length !== doc.annots.length) commit(next);
  }, [commit, doc.annots]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    setPast(past.slice(0, -1));
    setFuture([doc.annots, ...future].slice(0, MAX_HISTORY));
    onUpdateDoc(doc.id, (d) => setAnnots(d, prev));
  }, [past, future, doc.annots, doc.id, onUpdateDoc]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0]!;
    setFuture(future.slice(1));
    setPast([...past, doc.annots].slice(-MAX_HISTORY));
    onUpdateDoc(doc.id, (d) => setAnnots(d, next));
  }, [past, future, doc.annots, doc.id, onUpdateDoc]);

  const clearAll = useCallback(() => {
    if (doc.annots.length === 0) return;
    commit([]);
  }, [commit, doc.annots.length]);

  /**
   * Switching between pen-ish and marker-ish tools swaps the ink defaults —
   * a black 2.5pt highlighter (or a 16pt yellow pen) is never what you meant.
   */
  const pickTool = useCallback((id: AnnotTool) => {
    setTool(id);
    setStyle((s) => {
      const isMarkerInk = HIGHLIGHTS.includes(s.color);
      if (id === "highlighter" && !isMarkerInk) {
        return { ...s, color: HIGHLIGHTS[0]!, width: Math.max(s.width, 16) };
      }
      if (id !== "highlighter" && id !== "eraser" && isMarkerInk) {
        return { ...s, color: DEFAULT_STYLE.color, width: DEFAULT_STYLE.width };
      }
      return s;
    });
  }, []);

  // ── Shortcuts ─────────────────────────────────────────────────────────────
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
      if (e.key === "[") { e.preventDefault(); setPage((p) => Math.max(0, p - 1)); return; }
      if (e.key === "]") { e.preventDefault(); setPage((p) => Math.min(doc.pageCount - 1, p + 1)); return; }
      const hit = TOOLS.find((it) => it.key === e.key.toLowerCase());
      if (hit) { e.preventDefault(); pickTool(hit.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, pickTool, doc.pageCount]);

  const activeSignature = useMemo(
    () => signatures.find((s) => s.id === sigId) ?? null,
    [signatures, sigId],
  );

  const pending = doc.annots.length;
  const onThisPage = doc.annots.filter((a) => a.page === page).length;
  const zoomIndex = ZOOMS.findIndex((z) => Math.abs(z - (zoom ?? 1)) < 0.001);

  const apply = async () => {
    if (pending === 0) return;
    await onApply();
    setPast([]);
    setFuture([]);
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
              onClick={() => pickTool(it.id)}
              title={`${it.label} (${it.key})`}
              aria-pressed={tool === it.id}
              className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs transition ${
                tool === it.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-bg hover:text-fg"
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
          <button type="button" onClick={clearAll} disabled={pending === 0}
                  title="Discard all unapplied ink"
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
              ? "No unapplied ink"
              : `${pending} item${pending === 1 ? "" : "s"} (${onThisPage} on this page)`}
          </span>
          <button
            type="button"
            disabled={busy || pending === 0}
            onClick={apply}
            title="Burn the annotations into the document"
            className="flex items-center gap-1 rounded border border-accent bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25 disabled:opacity-40"
          >
            <Check size={14} aria-hidden /> Apply ink
          </button>
        </div>
      </div>

      {/* Canvas + options */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div
          ref={scrollRef}
          className="flex min-h-[60vh] min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-bg p-4"
        >
          {/* `m-auto` (not justify-center) so an over-wide page can still be
              scrolled to its left edge. */}
          {box && zoom !== null ? (
            <div className="m-auto">
              <AnnotateCanvas
                doc={doc}
                page={page}
                box={box}
                zoom={zoom}
                tool={tool}
                style={style}
                signature={activeSignature}
                onAdd={addAnnotation}
                onErase={eraseIds}
              />
            </div>
          ) : (
            <div className="m-auto text-sm text-muted">Preparing page…</div>
          )}
        </div>

        <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-3 lg:w-64">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            {TOOLS.find((t) => t.id === tool)?.label ?? "Draw"}
          </h2>
          <DrawPanel
            tool={tool}
            style={style}
            onStyle={(patch) => setStyle((s) => ({ ...s, ...patch }))}
            signatures={signatures}
            onSignatures={setSignatures}
            activeSignatureId={sigId}
            onPickSignature={(id) => { setSigId(id); if (id) pickTool("signature"); }}
            onToast={onToast}
          />
        </aside>
      </div>

      {tool === "signature" && !activeSignature && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          No signature saved yet — create one in the Signatures section of the panel,
          then click the page to stamp it.
        </p>
      )}
    </div>
  );
}
