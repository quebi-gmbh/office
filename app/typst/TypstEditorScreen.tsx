import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  Loader2,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  StretchVertical,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  compilePdf,
  compileSvg,
  getTypst,
  renderDomInto,
  type DomHandle,
} from "./typst-runtime";
import {
  usePendingFileOpen,
  useUnsavedGuard,
  writeText,
  type WsFileRef,
} from "~/lib/workspace";
import { STARTER_DOC } from "./starter";
import { typst } from "./typst-language";
import {
  buildSections,
  fractionToOffset,
  offsetToFraction,
  sectionBand,
  sectionIndexForOffset,
  type Section,
} from "./sync-map";
import { setSyncLine, syncHighlight } from "./sync-highlight";
import { countPages, splitSvgPages } from "./svg-pages";
import {
  downloadBlob,
  hashToSource,
  sourceToHash,
  svgToPngBlob,
} from "./export-utils";

type PreviewMode = "svg" | "text";
/** Vertical band [top, height] as fractions of the preview content height. */
type Band = { top: number; height: number };

const STORAGE_KEY = "typst:source";
const COMPILE_DEBOUNCE_MS = 400;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

type Status =
  | { kind: "loading" }
  | { kind: "compiling" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function loadInitialSource(): string {
  // A shared link (#src=…) wins over locally-stored / starter content.
  if (typeof location !== "undefined") {
    const shared = hashToSource(location.hash);
    if (shared !== null) return shared;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) ?? STARTER_DOC;
  } catch {
    return STARTER_DOC;
  }
}

/** Current scroll position of an element as a fraction [0, 1] of its range. */
function scrollFraction(el: HTMLElement): number {
  const range = el.scrollHeight - el.clientHeight;
  return range > 0 ? el.scrollTop / range : 0;
}

/** Scroll an element to a fraction [0, 1] of its range. */
function setScrollFraction(el: HTMLElement, fraction: number): void {
  const range = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.max(0, Math.min(1, fraction)) * range;
}

export function TypstEditorScreen() {
  const [source, setSource] = useState<string>(loadInitialSource);
  const [svg, setSvg] = useState<string>("");
  const [compiledSource, setCompiledSource] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [lastCompileMs, setLastCompileMs] = useState<number | null>(null);
  const [autoCompile, setAutoCompile] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("svg");
  const [band, setBand] = useState<Band | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const [wsFileName, setWsFileName] = useState<string | null>(null);
  const wsRef = useRef<WsFileRef | null>(null);
  const savedSourceRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scroll-sync + selectable-preview plumbing ─────────────────────────────
  const editorViewRef = useRef<EditorView | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const domContainerRef = useRef<HTMLDivElement | null>(null);
  const domHandleRef = useRef<DomHandle | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  const syncingRef = useRef(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncEnabledRef = useRef(syncEnabled);
  syncEnabledRef.current = syncEnabled;

  // Rebuild the section map whenever the source changes.
  useEffect(() => {
    sectionsRef.current = buildSections(source);
  }, [source]);

  // Page count follows the compiled document.
  useEffect(() => {
    setPageCount(svg ? Math.max(1, countPages(svg)) : 1);
  }, [svg]);

  // Run a scroll write without it bouncing back through the paired listener.
  const withSyncGuard = useCallback((fn: () => void) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    fn();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        syncingRef.current = false;
      }),
    );
  }, []);

  const stale =
    status.kind === "ready" && !!svg && source !== compiledSource;

  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 1800);
  }, []);

  // Persist to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [source]);

  const runCompile = useCallback(async (src: string) => {
    setStatus({ kind: "compiling" });
    const started = performance.now();
    try {
      const { svg } = await compileSvg(src);
      setSvg(svg);
      setCompiledSource(src);
      setLastCompileMs(Math.round(performance.now() - started));
      setStatus({ kind: "ready" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Keep the latest handlers reachable from the (stable) CodeMirror keymap.
  const runCompileRef = useRef(runCompile);
  runCompileRef.current = runCompile;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Preload the compiler on mount, then first compile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getTypst();
        if (cancelled) return;
        await runCompile(sourceRef.current);
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? `Failed to load the Typst compiler: ${err.message}`
              : "Failed to load the Typst compiler.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runCompile]);

  // Debounced auto-compile on edits.
  useEffect(() => {
    if (!autoCompile) return;
    if (status.kind === "loading") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runCompile(source);
    }, COMPILE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Intentionally keyed on source/autoCompile; runCompile is stable.
  }, [source, autoCompile]); // eslint-disable-line

  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const bytes = await compilePdf(sourceRef.current);
      downloadBlob(
        new Blob([bytes.slice()], { type: "application/pdf" }),
        "document.pdf",
      );
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloading(false);
    }
  }, []);
  const downloadPdfRef = useRef(downloadPdf);
  downloadPdfRef.current = downloadPdf;

  const downloadSvg = useCallback(() => {
    if (!svg) return;
    downloadBlob(
      new Blob([svg], { type: "image/svg+xml" }),
      "document.svg",
    );
  }, [svg]);

  const downloadPng = useCallback(async () => {
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg, 2);
      downloadBlob(blob, "document.png");
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : "PNG export failed");
    }
  }, [svg, flashNotice]);

  const copySource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sourceRef.current);
      flashNotice("Source copied");
    } catch {
      flashNotice("Copy failed");
    }
  }, [flashNotice]);

  const copyShareLink = useCallback(async () => {
    const hash = sourceToHash(sourceRef.current);
    try {
      history.replaceState(null, "", hash);
    } catch {
      /* ignore */
    }
    const url = `${location.origin}${location.pathname}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      flashNotice("Share link copied");
    } catch {
      flashNotice("Link is in the address bar");
    }
  }, [flashNotice]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor)));
  }, []);

  // ── Workspace: open a .typ handed off from the sidebar; save writes source back ─
  const saveToWorkspace = useCallback(async (): Promise<boolean> => {
    if (!wsRef.current) return false;
    try {
      await writeText(wsRef.current, sourceRef.current);
      savedSourceRef.current = sourceRef.current;
      flashNotice(`Saved ${wsFileName ?? ""}`.trim());
    } catch (e) {
      flashNotice(`Save failed: ${(e as Error).message}`);
    }
    return true;
  }, [flashNotice, wsFileName]);

  usePendingFileOpen("typst", async ({ ref, name, file }) => {
    const text = await file.text();
    wsRef.current = ref;
    savedSourceRef.current = text;
    setWsFileName(name);
    setSource(text);
  });

  useUnsavedGuard({
    dirty: !!wsRef.current && source !== savedSourceRef.current,
    name: wsFileName ?? "Untitled",
    save: async () => {
      await saveToWorkspace();
      return true;
    },
  });

  // Ctrl/Cmd-S saves back to the workspace file when one is open, else exports PDF.
  const saveActionRef = useRef<() => void>(() => {});
  saveActionRef.current = () => {
    if (wsRef.current) void saveToWorkspace();
    else void downloadPdfRef.current();
  };

  // CodeMirror extensions (stable): Typst mode, dark theme, our shortcuts.
  const extensions = useMemo(
    () => [
      typst(),
      oneDark,
      syncHighlight(),
      keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: () => {
            void runCompileRef.current(sourceRef.current);
            return true;
          },
        },
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            saveActionRef.current();
            return true;
          },
        },
      ]),
    ],
    [],
  );

  // Update the highlighted section band from the editor's cursor position.
  const updateBandFromCursor = useCallback((view: EditorView) => {
    const sections = sectionsRef.current;
    if (sections.length === 0) {
      setBand(null);
      return;
    }
    const docLen = Math.max(1, view.state.doc.length);
    const offset = view.state.selection.main.head;
    const idx = sectionIndexForOffset(sections, offset);
    const { top, bottom } = sectionBand(sections[idx], docLen);
    setBand({ top, height: Math.max(0.015, bottom - top) });
  }, []);

  // CodeMirror update handler: keep the band in sync, and on pure cursor
  // navigation (selection changed but not the doc) scroll the preview to match.
  const onEditorUpdate = useCallback(
    (vu: { view: EditorView; docChanged: boolean; selectionSet: boolean }) => {
      if (!vu.selectionSet && !vu.docChanged) return;
      updateBandFromCursor(vu.view);
      if (vu.selectionSet && !vu.docChanged && syncEnabledRef.current) {
        const prev = previewScrollRef.current;
        if (prev) {
          const docLen = Math.max(1, vu.view.state.doc.length);
          const frac = offsetToFraction(
            vu.view.state.selection.main.head,
            docLen,
          );
          withSyncGuard(() => setScrollFraction(prev, frac));
        }
      }
    },
    [updateBandFromCursor, withSyncGuard],
  );

  // Bidirectional viewport scroll sync between the editor and the preview.
  useEffect(() => {
    const view = editorViewRef.current;
    const preview = previewScrollRef.current;
    if (!view || !preview) return;
    const editorScroll = view.scrollDOM;
    const onEditorScroll = () => {
      if (!syncEnabledRef.current) return;
      withSyncGuard(() =>
        setScrollFraction(preview, scrollFraction(editorScroll)),
      );
    };
    const onPreviewScroll = () => {
      if (!syncEnabledRef.current) return;
      withSyncGuard(() =>
        setScrollFraction(editorScroll, scrollFraction(preview)),
      );
    };
    editorScroll.addEventListener("scroll", onEditorScroll, { passive: true });
    preview.addEventListener("scroll", onPreviewScroll, { passive: true });
    return () => {
      editorScroll.removeEventListener("scroll", onEditorScroll);
      preview.removeEventListener("scroll", onPreviewScroll);
    };
    // Re-attach when the editor becomes ready or the preview surface swaps.
  }, [editorReady, previewMode, status.kind, withSyncGuard]);

  // Selectable-text (DOM render) mode: mount/refresh after each compile, with a
  // hard fallback to the SVG preview if the experimental renderer throws.
  useEffect(() => {
    if (previewMode !== "text") {
      domHandleRef.current?.dispose();
      domHandleRef.current = null;
      return;
    }
    if (status.kind !== "ready") return;
    const container = domContainerRef.current;
    if (!container) return;
    let disposed = false;
    (async () => {
      try {
        domHandleRef.current?.dispose();
        domHandleRef.current = null;
        const handle = await renderDomInto(container, compiledSource || source);
        if (disposed) {
          handle.dispose();
          return;
        }
        domHandleRef.current = handle;
      } catch {
        if (!disposed) {
          flashNotice("Selectable preview unavailable — using image");
          setPreviewMode("svg");
        }
      }
    })();
    return () => {
      disposed = true;
    };
    // compiledSource changes once per successful compile.
  }, [previewMode, status.kind, compiledSource, source, flashNotice]);

  // Tear the DOM mount down on unmount.
  useEffect(() => {
    return () => {
      domHandleRef.current?.dispose();
      domHandleRef.current = null;
    };
  }, []);

  // Reveal + transiently highlight the section of the source at a given
  // fraction of the document, and show the matching band in the preview.
  const revealSourceAtFraction = useCallback((fraction: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    const sections = sectionsRef.current;
    if (sections.length === 0) return;
    const docLen = Math.max(1, view.state.doc.length);
    const idx = sectionIndexForOffset(
      sections,
      fractionToOffset(fraction, docLen),
    );
    const section = sections[idx];
    const line = view.state.doc.lineAt(Math.min(section.start, docLen));
    view.dispatch({
      effects: [
        EditorView.scrollIntoView(line.from, { y: "center" }),
        setSyncLine.of(line.from),
      ],
    });
    const { top, bottom } = sectionBand(section, docLen);
    setBand({ top, height: Math.max(0.015, bottom - top) });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      editorViewRef.current?.dispatch({ effects: setSyncLine.of(null) });
    }, 1600);
  }, []);

  // Compute a [0,1] fraction of the whole document for a target inside the
  // preview, from typst's page list (each `.typst-page` carries its height).
  const pageTargetToFraction = useCallback(
    (container: HTMLElement, page: number, y: number): number => {
      const pages = Array.from(
        container.querySelectorAll<HTMLElement>(".typst-page"),
      );
      let total = 0;
      let before = 0;
      pages.forEach((p, i) => {
        const h = parseFloat(p.getAttribute("data-page-height") || "0");
        if (i < page - 1) before += h;
        total += h;
      });
      return total > 0 ? Math.max(0, Math.min(1, (before + y) / total)) : 0;
    },
    [],
  );

  // Scroll the preview to an in-document location (1-based page + y in pt), and
  // follow in the editor when sync is on.
  const jumpToDocLocation = useCallback(
    (page: number, y: number) => {
      const container = previewScrollRef.current;
      if (!container) return;
      const pages = container.querySelectorAll<HTMLElement>(".typst-page");
      const pageEl = pages[page - 1];
      if (pageEl) {
        const pageHeightPt = parseFloat(
          pageEl.getAttribute("data-page-height") || "0",
        );
        const pageRect = pageEl.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const scale = pageHeightPt > 0 ? pageRect.height / pageHeightPt : 1;
        const targetTop =
          pageRect.top - cRect.top + container.scrollTop + y * scale;
        withSyncGuard(() =>
          container.scrollTo({
            top: Math.max(0, targetTop - container.clientHeight * 0.25),
            behavior: "smooth",
          }),
        );
      }
      if (syncEnabledRef.current) {
        revealSourceAtFraction(pageTargetToFraction(container, page, y));
      }
    },
    [revealSourceAtFraction, pageTargetToFraction, withSyncGuard],
  );

  // Wire typst's internal reference links. The SVG emits, per cross-reference,
  // `<a onclick="handleTypstLocation(this, page, x, y); return false">`. We
  // (1) provide the global it calls, and (2) also intercept clicks directly by
  // parsing that attribute — belt-and-braces, since inline handlers injected via
  // innerHTML don't always fire for SVG anchors.
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.handleTypstLocation = (
      _elem: unknown,
      page: number,
      _x: number,
      y: number,
    ) => jumpToDocLocation(page, y);

    const container = previewScrollRef.current;
    const CALL_RE =
      /handleTypstLocation\(\s*this\s*,\s*([\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a");
      const onclick = anchor?.getAttribute("onclick");
      if (!onclick) return;
      const m = CALL_RE.exec(onclick);
      if (!m) return;
      e.preventDefault();
      jumpToDocLocation(Number(m[1]), Number(m[3]));
    };
    container?.addEventListener("click", onClick);
    return () => {
      container?.removeEventListener("click", onClick);
      if (win.handleTypstLocation) delete win.handleTypstLocation;
    };
  }, [jumpToDocLocation, previewMode, status.kind]);

  // Preview text selection → reveal the corresponding section in the editor.
  useEffect(() => {
    const container = previewScrollRef.current;
    if (!container) return;
    const onPointerUp = () => {
      if (!syncEnabledRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.top === 0 && rect.height === 0)) return;
      const cRect = container.getBoundingClientRect();
      const yInContainer = rect.top - cRect.top + container.scrollTop;
      const fraction =
        container.scrollHeight > 0 ? yInContainer / container.scrollHeight : 0;
      revealSourceAtFraction(fraction);
    };
    container.addEventListener("pointerup", onPointerUp);
    return () => container.removeEventListener("pointerup", onPointerUp);
  }, [previewMode, status.kind, revealSourceAtFraction]);

  // Scroll the preview so page `n` (1-based) sits at the top.
  const scrollToPage = useCallback((n: number) => {
    const container = previewScrollRef.current;
    if (!container) return;
    const pages = container.querySelectorAll<HTMLElement>(".typst-page");
    const pageEl = pages[Math.max(0, Math.min(pages.length - 1, n - 1))];
    if (!pageEl) return;
    const cRect = container.getBoundingClientRect();
    const pRect = pageEl.getBoundingClientRect();
    container.scrollTo({
      top: Math.max(0, pRect.top - cRect.top + container.scrollTop - 8),
      behavior: "smooth",
    });
  }, []);

  // Track the current page from the scroll position.
  useEffect(() => {
    const container = previewScrollRef.current;
    if (!container) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const pages = container.querySelectorAll<HTMLElement>(".typst-page");
      if (pages.length === 0) return;
      const mid = container.getBoundingClientRect().top + container.clientHeight / 2;
      let cur = 1;
      pages.forEach((p, i) => {
        if (p.getBoundingClientRect().top <= mid) cur = i + 1;
      });
      setCurrentPage(cur);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [previewMode, status.kind, svg]);

  // Fit a whole page in the preview viewport (zoom = fraction of preview width).
  const fitPage = useCallback(() => {
    const container = previewScrollRef.current;
    const pageEl = container?.querySelector<HTMLElement>(".typst-page");
    if (!container || !pageEl) return;
    const pw = parseFloat(pageEl.getAttribute("data-page-width") || "0");
    const ph = parseFloat(pageEl.getAttribute("data-page-height") || "0");
    if (pw <= 0 || ph <= 0) return;
    const pad = 32; // p-4 → 1rem each side
    const availW = container.clientWidth - pad;
    const availH = container.clientHeight - pad;
    if (availW <= 0 || availH <= 0) return;
    // Page height at zoom z is z·availW·(ph/pw); solve for it to equal availH.
    const z = (availH * pw) / (availW * ph);
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)));
  }, []);

  // Download the current page as a standalone SVG.
  const downloadCurrentPageSvg = useCallback(() => {
    if (!svg) return;
    const pages = splitSvgPages(svg);
    const page = pages[Math.max(0, Math.min(pages.length - 1, currentPage - 1))];
    if (!page) {
      flashNotice("No page to export");
      return;
    }
    downloadBlob(
      new Blob([page.svg], { type: "image/svg+xml" }),
      `document-page-${currentPage}.svg`,
    );
  }, [svg, currentPage, flashNotice]);

  const busy = status.kind === "loading" || status.kind === "compiling";

  return (
    <section
      data-full-bleed
      className="flex h-[calc(100vh-9rem)] min-h-[30rem] flex-col"
    >
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Typst editor</h1>
        <StatusPill status={status} stale={stale} lastMs={lastCompileMs} />
        {notice && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            {notice}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="accent-accent"
            />
            Auto
          </label>
          <button
            type="button"
            onClick={() => void runCompile(source)}
            disabled={status.kind === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-accent/40 disabled:opacity-50"
          >
            <RefreshCw size={15} aria-hidden /> Compile
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={busy || downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Download size={15} aria-hidden />
            )}
            PDF
          </button>

          {/* Export / share menu (native <details> — no click-outside logic). */}
          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-accent/40 [&::-webkit-details-marker]:hidden">
              <MoreHorizontal size={15} aria-hidden /> Export
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-bg py-1 shadow-lg">
              {wsFileName && (
                <MenuItem onClick={() => void saveToWorkspace()}>
                  Save to {wsFileName}
                </MenuItem>
              )}
              <MenuItem onClick={downloadSvg} disabled={!svg}>
                Download SVG
              </MenuItem>
              {pageCount > 1 && (
                <MenuItem onClick={downloadCurrentPageSvg} disabled={!svg}>
                  Download page {currentPage} (SVG)
                </MenuItem>
              )}
              <MenuItem onClick={() => void downloadPng()} disabled={!svg}>
                Download PNG
              </MenuItem>
              <MenuItem onClick={() => void copySource()}>Copy source</MenuItem>
              <MenuItem onClick={() => void copyShareLink()}>
                Copy share link
              </MenuItem>
            </div>
          </details>
        </div>
      </div>

      {/* Split panes */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        {/* Editor */}
        <div className="min-h-0 overflow-hidden rounded-xl border border-border">
          <CodeMirror
            value={source}
            onChange={setSource}
            extensions={extensions}
            theme={oneDark}
            height="100%"
            style={{ height: "100%", fontSize: "13px" }}
            onCreateEditor={(view) => {
              editorViewRef.current = view;
              setEditorReady(true);
            }}
            onUpdate={onEditorUpdate}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              foldGutter: false,
              autocompletion: false,
              tabSize: 2,
            }}
          />
        </div>

        {/* Preview */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
          {/* Preview toolbar: zoom + fit */}
          <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1 text-sm">
            <button
              type="button"
              onClick={() => zoomBy(0.8)}
              className="rounded p-1 text-muted transition hover:text-accent"
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-12 text-center tabular-nums text-muted">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomBy(1.25)}
              className="rounded p-1 text-muted transition hover:text-accent"
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted transition hover:text-accent"
            >
              <Maximize2 size={13} /> Fit width
            </button>
            <button
              type="button"
              onClick={fitPage}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted transition hover:text-accent"
            >
              <StretchVertical size={13} /> Fit page
            </button>

            {/* Page navigation (multi-page docs). */}
            {pageCount > 1 && (
              <div className="ml-2 flex items-center gap-0.5 text-xs text-muted">
                <button
                  type="button"
                  onClick={() => scrollToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="rounded p-1 transition hover:text-accent disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="tabular-nums">
                  {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => scrollToPage(currentPage + 1)}
                  disabled={currentPage >= pageCount}
                  className="rounded p-1 transition hover:text-accent disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSyncEnabled((v) => !v)}
                aria-pressed={syncEnabled}
                title="Sync scrolling between editor and preview"
                className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs transition ${
                  syncEnabled ? "text-accent" : "text-muted hover:text-accent"
                }`}
              >
                <Link2 size={13} /> Sync
              </button>
              <button
                type="button"
                onClick={() =>
                  setPreviewMode((m) => (m === "svg" ? "text" : "svg"))
                }
                aria-pressed={previewMode === "text"}
                title="Selectable/copyable text (beta)"
                className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs transition ${
                  previewMode === "text"
                    ? "text-accent"
                    : "text-muted hover:text-accent"
                }`}
              >
                <Type size={13} /> Selectable
              </button>
            </div>
          </div>

          {status.kind === "error" && (
            <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs">
                {status.message}
              </pre>
            </div>
          )}

          <div
            ref={previewScrollRef}
            className="min-h-0 flex-1 overflow-auto bg-bg p-4"
          >
            {status.kind === "loading" ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted">
                <Loader2 size={18} className="animate-spin" aria-hidden />
                Loading the Typst compiler…
              </div>
            ) : (
              <div
                className="relative mx-auto"
                style={{ width: `${zoom * 100}%` }}
              >
                {/* Section highlight band (proportional to source position). */}
                {syncEnabled && band && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10 rounded bg-accent/10 ring-1 ring-accent/40 transition-all"
                    style={{
                      top: `${band.top * 100}%`,
                      height: `${band.height * 100}%`,
                    }}
                  />
                )}
                {/* Selectable text (DOM render mode). Hidden in svg mode. */}
                <div
                  ref={domContainerRef}
                  className={`[&_svg]:h-auto [&_svg]:w-full [&_svg]:bg-white [&_svg]:shadow-lg ${
                    previewMode === "text" ? "" : "hidden"
                  }`}
                />
                {/* Image (SVG string) preview. */}
                {previewMode === "svg" &&
                  (svg ? (
                    <div
                      className="[&_svg]:h-auto [&_svg]:w-full [&_svg]:bg-white [&_svg]:shadow-lg"
                      // Produced by our own local WASM compiler from the user's
                      // own input — no external/untrusted HTML.
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  ) : (
                    <div className="py-16 text-center text-muted">
                      No preview yet.
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuItem({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        // Close the parent <details> after acting.
        e.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      className="block w-full px-3 py-1.5 text-left text-sm transition hover:bg-accent/10 hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit"
    >
      {children}
    </button>
  );
}

function StatusPill({
  status,
  stale,
  lastMs,
}: {
  status: Status;
  stale: boolean;
  lastMs: number | null;
}) {
  let label: string;
  let className: string;
  if (status.kind === "loading") {
    label = "loading…";
    className = "text-muted border-muted/30";
  } else if (status.kind === "compiling") {
    label = "compiling…";
    className = "text-accent border-accent/30";
  } else if (status.kind === "error") {
    label = "error";
    className = "text-red-500 border-red-500/30";
  } else if (stale) {
    label = "stale";
    className = "text-amber-500 border-amber-500/30";
  } else {
    label = lastMs != null ? `compiled in ${lastMs}ms` : "ready";
    className = "text-accent border-accent/30";
  }
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
