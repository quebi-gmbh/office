/**
 * PdfApp — top-level shell for /pdf.
 *
 * Layout:
 *   header             ← toolbar (open, save, close, doc tabs)
 *   ┌─────────────────┐
 *   │ rail │ workspace │
 *   │      │           │
 *   │ ops  │ thumbs +  │
 *   │      │ panel     │
 *   └─────────────────┘
 *
 * State lives here so panels can be cheaply swapped. Open docs and the
 * active panel id are the only persistent UI state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilePlus, Download, X as XIcon, Globe,
} from "lucide-react";
import { useToast } from "~/components/Toast";
import { OperationRail, type PanelId } from "~/pdf/ui/OperationRail";
import { ThumbnailGrid } from "~/pdf/ui/ThumbnailGrid";
import { PreviewPane } from "~/pdf/ui/PreviewPane";
import { PasswordPrompt } from "~/pdf/ui/PasswordPrompt";
import {
  createDoc, replaceBytes, setPassword, type OpenDoc,
  selectAll, clearSelection,
} from "~/pdf/lib/state";
import { invalidateDoc, probePassword } from "~/pdf/lib/thumb-cache";
import type { PasswordErrorKind } from "~/pdf/io/pdfjs";
import { pickPdfFiles, fetchPdfFromUrl, isPdfFile } from "~/pdf/io/load";
import { downloadBytes, suffixedName } from "~/pdf/io/save";
import { usePendingFileOpen, writeBlob, type WsFileRef } from "~/lib/workspace";

import { PagesPanel } from "~/pdf/ui/panels/PagesPanel";
import { MergePanel } from "~/pdf/ui/panels/MergePanel";
import { SplitPanel } from "~/pdf/ui/panels/SplitPanel";
import { WatermarkPanel } from "~/pdf/ui/panels/WatermarkPanel";
import { ImageStampPanel } from "~/pdf/ui/panels/ImageStampPanel";
import { PageNumbersPanel } from "~/pdf/ui/panels/PageNumbersPanel";
import { ImagesToPdfPanel } from "~/pdf/ui/panels/ImagesToPdfPanel";
import { ExtractTextPanel } from "~/pdf/ui/panels/ExtractTextPanel";
import { FormsPanel } from "~/pdf/ui/panels/FormsPanel";
import { MetadataPanel } from "~/pdf/ui/panels/MetadataPanel";
import { SecurityPanel } from "~/pdf/ui/panels/SecurityPanel";
import { CropPanel } from "~/pdf/ui/panels/CropPanel";

const THUMB_WIDTH = 128;
const PREVIEW_WIDTH = 520;

export function PdfApp() {
  const [docs, setDocs] = useState<OpenDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  // Password-error kind for the active doc (null = renders fine / not encrypted).
  const [pwNeeded, setPwNeeded] = useState<PasswordErrorKind | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const { show: showToast, ToastContainer } = useToast();

  // Workspace file ref per doc opened from the sidebar; Save writes bytes back.
  const wsRefs = useRef<Map<string, WsFileRef>>(new Map());

  const activeDoc = docs.find((d) => d.id === activeDocId) ?? null;

  // ── Workspace: open a PDF handed off from the folder sidebar ───────────────
  usePendingFileOpen("pdf", async ({ ref, name, file }) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const created = await createDoc(name, bytes);
      setDocs((prev) => [...prev, created]);
      setActiveDocId(created.id);
      wsRefs.current.set(created.id, ref);
      showToast(`Opened ${name}`);
    } catch (e) {
      showToast(`Couldn't open ${name}: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  });

  // Default to the Pages panel as soon as a doc is open.
  useEffect(() => {
    if (activeDoc && !activePanel) setActivePanel("pages");
    if (!activeDoc && activePanel === "pages") setActivePanel(null);
  }, [activeDoc, activePanel]);

  // Detect whether the active (encrypted) doc still needs a password before its
  // pages can be rendered. Unencrypted docs — and encrypted ones with an empty
  // user password — probe clean and never show the prompt. Reuses the cached
  // pdfjs load, so this doesn't parse the document twice.
  const activeId = activeDoc?.id ?? null;
  const activeRev = activeDoc?.rev ?? 0;
  const activeEncrypted = activeDoc?.encrypted ?? false;
  const activeBytes = activeDoc?.bytes;
  const activePassword = activeDoc?.password;
  useEffect(() => {
    if (!activeId || !activeEncrypted || !activeBytes) {
      setPwNeeded(null);
      return;
    }
    let alive = true;
    probePassword(activeId, activeRev, activeBytes, activePassword)
      .then((kind) => { if (alive) setPwNeeded(kind); })
      .catch(() => { if (alive) setPwNeeded(null); });
    return () => { alive = false; };
  }, [activeId, activeRev, activeEncrypted, activeBytes, activePassword]);

  // Apply an entered password and re-run the blocked renders.
  const submitPassword = useCallback((password: string) => {
    if (!activeDoc) return;
    invalidateDoc(activeDoc.id);
    setDocs((prev) => prev.map((d) => (d.id === activeDoc.id ? setPassword(d, password) : d)));
  }, [activeDoc]);

  // Open files via picker.
  const openFiles = useCallback(async () => {
    const files = await pickPdfFiles(true);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const created: OpenDoc[] = [];
      for (const f of files) {
        try {
          created.push(await createDoc(f.name, f.bytes));
        } catch (e) {
          showToast(`Couldn't open ${f.name}: ${(e as Error).message}`, "error");
        }
      }
      if (created.length === 0) return;
      setDocs((prev) => [...prev, ...created]);
      setActiveDocId(created[0]!.id);
      showToast(`Opened ${created.length} PDF${created.length === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  // Open from URL prompt.
  const openFromUrl = useCallback(async () => {
    const url = window.prompt("PDF URL:");
    if (!url) return;
    setBusy(true);
    try {
      const file = await fetchPdfFromUrl(url);
      const created = await createDoc(file.name, file.bytes);
      setDocs((prev) => [...prev, created]);
      setActiveDocId(created.id);
      showToast(`Opened ${created.name}`);
    } catch (e) {
      showToast(`Open failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  // Open from raw bytes (used by panels that produce a fresh PDF, e.g. merge,
  // images-to-pdf).
  const addOpened = useCallback(async (bytes: Uint8Array, name: string) => {
    const created = await createDoc(name, bytes);
    setDocs((prev) => [...prev, created]);
    setActiveDocId(created.id);
  }, []);

  // Replace the active doc's bytes (used after every editing operation).
  const replaceActiveBytes = useCallback(async (bytes: Uint8Array) => {
    if (!activeDoc) return;
    const next = await replaceBytes(activeDoc, bytes);
    invalidateDoc(activeDoc.id);
    setDocs((prev) => prev.map((d) => (d.id === activeDoc.id ? next : d)));
    setPreviewPage((p) => (p !== null && p >= next.pageCount ? null : p));
  }, [activeDoc]);

  // Update an arbitrary doc (used by ThumbnailGrid's selection callback).
  const updateDoc = useCallback((id: string, updater: (d: OpenDoc) => OpenDoc) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? updater(d) : d)));
  }, []);

  const closeDoc = useCallback((id: string) => {
    invalidateDoc(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setActiveDocId((cur) => {
      if (cur !== id) return cur;
      const remaining = docs.filter((d) => d.id !== id);
      return remaining.length > 0 ? remaining[0]!.id : null;
    });
  }, [docs]);

  const saveActive = useCallback(() => {
    if (!activeDoc) return;
    const ref = wsRefs.current.get(activeDoc.id);
    if (ref) {
      const bytes = activeDoc.bytes;
      void writeBlob(ref, new Blob([bytes as BlobPart], { type: "application/pdf" }))
        .then(() => showToast(`Saved ${activeDoc.name}`))
        .catch((e) => showToast(`Save failed: ${(e as Error).message}`, "error"));
      return;
    }
    downloadBytes(activeDoc.bytes, suffixedName(activeDoc.name));
    showToast(`Saved ${suffixedName(activeDoc.name)}`);
  }, [activeDoc, showToast]);

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "o") { e.preventDefault(); openFiles(); return; }
      if (mod && e.key === "s") { e.preventDefault(); saveActive(); return; }
      if (mod && (e.key === "a" || e.key === "A") && activeDoc &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        updateDoc(activeDoc.id, (d) => selectAll(d));
        return;
      }
      if (e.key === "Escape" && activeDoc) {
        updateDoc(activeDoc.id, (d) => clearSelection(d));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openFiles, saveActive, activeDoc, updateDoc]);

  // Drag & drop.
  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.items).some((it) => it.kind === "file")) {
      e.preventDefault();
      setDragging(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(isPdfFile);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const created: OpenDoc[] = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        try {
          created.push(await createDoc(f.name, new Uint8Array(buf)));
        } catch (err) {
          showToast(`Couldn't open ${f.name}: ${(err as Error).message}`, "error");
        }
      }
      if (created.length === 0) return;
      setDocs((prev) => [...prev, ...created]);
      setActiveDocId(created[0]!.id);
      showToast(`Opened ${created.length} PDF${created.length === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      ref={dropRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative flex flex-col gap-2"
      style={{ minHeight: "calc(100vh - 9rem)" }}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-bg/80 text-accent">
          Drop PDF{`(s)`} to open
        </div>
      )}

      {/* Header / toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-xl font-semibold tracking-tight">PDF tools</h1>
          {activeDoc && (
            <span className="text-sm text-muted">
              {activeDoc.name} · {activeDoc.pageCount} page{activeDoc.pageCount === 1 ? "" : "s"}
              {activeDoc.encrypted && <span className="ml-2 text-amber-400">encrypted</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={busy}
                  onClick={openFiles}
                  title="Open PDF (Ctrl-O)"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition hover:bg-card hover:text-fg disabled:opacity-40">
            <FilePlus size={14} aria-hidden /> Open
          </button>
          <button type="button" disabled={busy}
                  onClick={openFromUrl}
                  title="Open from URL"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition hover:bg-card hover:text-fg disabled:opacity-40">
            <Globe size={14} aria-hidden /> URL
          </button>
          <button type="button" disabled={!activeDoc || busy}
                  onClick={saveActive}
                  title="Save (Ctrl-S)"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition hover:bg-card hover:text-fg disabled:opacity-40">
            <Download size={14} aria-hidden /> Save
          </button>
        </div>
      </header>

      {/* Doc tabs */}
      {docs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {docs.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-1 rounded-t border border-b-0 px-2 py-1 text-xs ${
                d.id === activeDocId
                  ? "border-border bg-card text-fg"
                  : "border-transparent text-muted hover:bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveDocId(d.id)}
                className="truncate"
                style={{ maxWidth: 200 }}
                title={d.name}
              >
                {d.name}
              </button>
              <button
                type="button"
                onClick={() => closeDoc(d.id)}
                aria-label={`Close ${d.name}`}
                className="rounded p-0.5 text-muted hover:bg-bg hover:text-fg"
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main split */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Operation rail */}
        <aside className="w-52 shrink-0 rounded-xl border border-border bg-card p-2">
          <OperationRail
            active={activePanel}
            onPick={setActivePanel}
            hasDoc={docs.length > 0}
            hasMultiDoc={docs.length >= 2}
          />
        </aside>

        {/* Workspace */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {activeDoc ? (
            <>
              {/* Password prompt for encrypted docs that can't render yet */}
              {pwNeeded && (
                <PasswordPrompt
                  incorrect={pwNeeded === "incorrect"}
                  busy={busy}
                  onSubmit={submitPassword}
                />
              )}

              {/* Thumbnails + selection bar */}
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span>
                    {activeDoc.selected.size > 0
                      ? `${activeDoc.selected.size} of ${activeDoc.pageCount} selected`
                      : `${activeDoc.pageCount} pages`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateDoc(activeDoc.id, selectAll)}
                      className="rounded px-2 py-0.5 hover:bg-bg hover:text-fg"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDoc(activeDoc.id, clearSelection)}
                      className="rounded px-2 py-0.5 hover:bg-bg hover:text-fg"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <ThumbnailGrid
                    doc={activeDoc}
                    thumbWidth={THUMB_WIDTH}
                    onSelectionChange={(selected) =>
                      updateDoc(activeDoc.id, (d) => ({ ...d, selected }))
                    }
                  />
                </div>
              </div>

              {/* Panel + preview row */}
              <div className="flex min-h-0 flex-1 gap-3">
                <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card p-4">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
                    {labelFor(activePanel)}
                  </h2>
                  <PanelHost
                    panel={activePanel}
                    docs={docs}
                    activeDoc={activeDoc}
                    busy={busy}
                    setBusy={setBusy}
                    onReplace={replaceActiveBytes}
                    onAddOpened={addOpened}
                    onToast={showToast}
                  />
                </div>
                <aside className="hidden w-[540px] shrink-0 flex-col gap-2 lg:flex">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Preview</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!previewPage || previewPage <= 0}
                        onClick={() => setPreviewPage((p) => Math.max(0, (p ?? 0) - 1))}
                        className="rounded px-2 py-0.5 hover:bg-bg disabled:opacity-30"
                      >‹</button>
                      <span className="font-mono">
                        {previewPage !== null
                          ? `${previewPage + 1} / ${activeDoc.pageCount}`
                          : `– / ${activeDoc.pageCount}`}
                      </span>
                      <button
                        type="button"
                        disabled={previewPage === null || previewPage >= activeDoc.pageCount - 1}
                        onClick={() => setPreviewPage((p) => Math.min(activeDoc.pageCount - 1, (p ?? -1) + 1))}
                        className="rounded px-2 py-0.5 hover:bg-bg disabled:opacity-30"
                      >›</button>
                    </div>
                  </div>
                  <PreviewPane
                    doc={activeDoc}
                    page={previewPage ?? (activeDoc.selected.size > 0 ? Math.min(...activeDoc.selected) : 0)}
                    width={PREVIEW_WIDTH}
                  />
                </aside>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card p-12">
              <div className="text-center">
                <FilePlus size={36} className="mx-auto mb-3 text-muted" aria-hidden />
                <p className="mb-1 font-medium">Open a PDF to start</p>
                <p className="mb-4 text-sm text-muted">
                  Or drop one anywhere on this page. You can also build a PDF from images
                  without opening anything.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={openFiles}
                    className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
                  >
                    Choose file…
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePanel("images-to-pdf")}
                    className="rounded border border-border bg-card px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Images → PDF
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Allow the images-to-pdf panel even with no doc open. */}
          {!activeDoc && activePanel === "images-to-pdf" && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
                Images → PDF
              </h2>
              <ImagesToPdfPanel busy={busy} onAddOpened={addOpened} onToast={showToast} />
            </div>
          )}
        </div>
      </div>

      <ToastContainer />
    </section>
  );
}

function labelFor(p: PanelId | null): string {
  switch (p) {
    case "pages": return "Pages";
    case "merge": return "Merge documents";
    case "split": return "Split document";
    case "watermark": return "Text watermark";
    case "stamp": return "Image stamp";
    case "numbers": return "Page numbers";
    case "images-to-pdf": return "Images → PDF";
    case "extract-text": return "Extract text";
    case "forms": return "Fill forms";
    case "metadata": return "Metadata";
    case "security": return "Security";
    case "crop": return "Crop";
    default: return "Pick an operation";
  }
}

// ── Panel switch ─────────────────────────────────────────────────────────────
type PanelHostProps = {
  panel: PanelId | null;
  docs: OpenDoc[];
  activeDoc: OpenDoc;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onReplace: (bytes: Uint8Array) => Promise<void>;
  onAddOpened: (bytes: Uint8Array, name: string) => Promise<void>;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

function PanelHost({
  panel, docs, activeDoc, busy, onReplace, onAddOpened, onToast,
}: PanelHostProps) {
  switch (panel) {
    case "pages":
      return <PagesPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "merge":
      return <MergePanel docs={docs} busy={busy} onAddOpened={onAddOpened} onToast={onToast} />;
    case "split":
      return <SplitPanel doc={activeDoc} busy={busy} onToast={onToast} />;
    case "watermark":
      return <WatermarkPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "stamp":
      return <ImageStampPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "numbers":
      return <PageNumbersPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "images-to-pdf":
      return <ImagesToPdfPanel busy={busy} onAddOpened={onAddOpened} onToast={onToast} />;
    case "extract-text":
      return <ExtractTextPanel doc={activeDoc} busy={busy} onToast={onToast} />;
    case "forms":
      return <FormsPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "metadata":
      return <MetadataPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "security":
      return <SecurityPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    case "crop":
      return <CropPanel doc={activeDoc} busy={busy} onReplace={onReplace} onToast={onToast} />;
    default:
      return <p className="text-sm text-muted">Pick an operation from the left rail.</p>;
  }
}
