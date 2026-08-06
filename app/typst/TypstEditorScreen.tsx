import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { lightThemeExtension } from "../lib/code-editor/theme";
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
  compilePreviewLatest,
  currentPreviewSvg,
  getTypst,
  renderDomInto,
  resetPreviewSession,
  type DomHandle,
} from "./typst-runtime";
import { applyPreviewFrame, PREVIEW_ROOT_CLASS } from "./svg-patch";
import {
  usePendingFileOpen,
  useUnsavedGuard,
  writeText,
  type WsFileRef,
} from "~/lib/workspace";
import { STARTER_DOC } from "./starter";
import { typst } from "./typst-language";
import {
  clamp,
  fractionToOffset,
  sectionIndexForOffset,
  sectionsForSource,
} from "./sync-map";
import {
  clientYToPageTarget,
  containerYToFraction,
  pageElements,
  pageHeightOf,
  pageHeights,
  pageTargetToFraction,
  type PageTarget,
} from "./preview-coords";
import { setSyncLine, syncHighlight } from "./sync-highlight";
import { splitSvgPages } from "./svg-pages";
import {
  downloadBlob,
  hashToSource,
  sourceToHash,
  svgToPngBlob,
} from "./export-utils";

type PreviewMode = "svg" | "text";

const STORAGE_KEY = "typst:source";
/** Debounce floor/ceiling for the auto-compile (see {@link compileDebounceMs}). */
const COMPILE_DEBOUNCE_MIN_MS = 600;
const COMPILE_DEBOUNCE_MAX_MS = 2000;
/** How long a preview → source jump stays highlighted in the editor. */
const HIGHLIGHT_MS = 1600;
/** Debounce for the (synchronous, whole-document) localStorage write. */
const STORAGE_DEBOUNCE_MS = 500;
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

/**
 * Wait roughly as long as the last compile took before starting the next one:
 * a fixed short debounce means a big document spends all its time compiling
 * stale input while the user is still typing.
 */
function compileDebounceMs(lastCompileMs: number | null): number {
  return clamp(
    lastCompileMs ?? COMPILE_DEBOUNCE_MIN_MS,
    COMPILE_DEBOUNCE_MIN_MS,
    COMPILE_DEBOUNCE_MAX_MS,
  );
}

/**
 * A ref that always holds the latest render's value, updated in an effect
 * rather than during render (render-phase writes are side effects and are
 * unsafe under concurrent rendering).
 */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function TypstEditorScreen() {
  const [source, setSource] = useState<string>(loadInitialSource);
  /**
   * What the preview currently shows. Deliberately *not* the document itself:
   * the rendered SVG lives only in the DOM, patched in place compile by compile
   * (see typst-runtime.ts), and this is the little that the React tree needs to
   * know about it. A fresh object per compile, so effects keyed on it re-run.
   */
  const [doc, setDoc] = useState<PreviewDoc | null>(null);
  const [compiledSource, setCompiledSource] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [lastCompileMs, setLastCompileMs] = useState<number | null>(null);
  const [autoCompile, setAutoCompile] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [wsFileName, setWsFileName] = useState<string | null>(null);
  const wsRef = useRef<WsFileRef | null>(null);
  const savedSourceRef = useRef<string>("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Jump-to-source plumbing ───────────────────────────────────────────────
  const editorViewRef = useRef<EditorView | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Written by the preview pane so the export menu can read it without state. */
  const currentPageRef = useRef(1);

  const sourceRef = useLatestRef(source);

  /** The element the document is patched into; React owns nothing inside it. */
  const previewHostRef = useRef<HTMLDivElement | null>(null);

  const pageCount = Math.max(1, doc?.pageCount ?? 1);
  const hasDocument = doc !== null;

  const stale =
    status.kind === "ready" && hasDocument && source !== compiledSource;

  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 1800);
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────────
  const persistSource = useCallback((src: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, src);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, []);

  // Debounced: writing the whole document synchronously on every keystroke is
  // one of the most expensive things this screen used to do.
  useEffect(() => {
    const t = setTimeout(
      () => persistSource(sourceRef.current),
      STORAGE_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [source, persistSource, sourceRef]);

  // …so nothing is lost, flush on the way out.
  useEffect(() => {
    const flush = () => persistSource(sourceRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [persistSource, sourceRef]);

  // ── Compile ───────────────────────────────────────────────────────────────
  /** Monotonic id so a slow compile can never overwrite a newer result. */
  const compileIdRef = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /** Last source handed to the compiler — auto-compile never retries it. */
  const attemptedSourceRef = useRef<string | null>(null);
  /** Guards the rebuild path below against retrying itself forever. */
  const rebuildingRef = useRef(false);

  const runCompile = useCallback(async (src: string) => {
    const id = ++compileIdRef.current;
    attemptedSourceRef.current = src;
    setStatus({ kind: "compiling" });
    const started = performance.now();
    try {
      const result = await compilePreviewLatest(src);
      // A newer request took over before this one ran: it owns the UI now.
      if (result.kind === "superseded") return;
      if (!aliveRef.current) return;

      // Frames are cumulative — each one patches the DOM the previous one left
      // behind — so every frame the compiler hands back has to be applied, even
      // one a newer compile has already overtaken. That is why this happens
      // here, in compile order, instead of via React state: a dropped or
      // batched-away frame would leave the DOM a step behind what the renderer
      // believes it drew, and the next patch would fail against it.
      const host = previewHostRef.current;
      const applied = host ? applyPreviewFrame(host, result.frame) : "failed";
      setDoc({ pageCount: result.frame.pageCount });

      // Bookkeeping, unlike the frame itself, belongs to the newest compile.
      if (id === compileIdRef.current) {
        setCompiledSource(src);
        setLastCompileMs(Math.round(performance.now() - started));
        setStatus({ kind: "ready" });
      }

      if (applied !== "failed") {
        rebuildingRef.current = false;
      } else if (!rebuildingRef.current) {
        // The live DOM and the renderer have diverged. Throw the incremental
        // state away and compile again: a fresh session's first frame is
        // standalone, so this resolves in one round and cannot loop.
        rebuildingRef.current = true;
        resetPreviewSession();
        setDoc(null);
        attemptedSourceRef.current = null;
        // Declared just below; only ever called long after this render.
        void runCompileRef.current(src);
      }
    } catch (err) {
      // A rebuild that never got as far as a frame is over; let the next
      // divergence start a fresh one rather than latching the guard on.
      rebuildingRef.current = false;
      if (!aliveRef.current || id !== compileIdRef.current) return;
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);
  const runCompileRef = useLatestRef(runCompile);

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
  }, [runCompile, sourceRef]);

  // When the last edit happened, so a compile finishing mid-typing re-arms the
  // debounce for the time *remaining* instead of restarting it from scratch.
  const lastEditAtRef = useRef(0);
  useEffect(() => {
    lastEditAtRef.current = performance.now();
  }, [source]);

  // Debounced auto-compile on edits.
  useEffect(() => {
    if (!autoCompile) return;
    if (status.kind === "loading") return;
    if (source === compiledSource) {
      // The preview already shows exactly this source, so a compile error left
      // over from an edit that has since been undone is stale — drop it.
      if (status.kind === "error" && attemptedSourceRef.current !== source) {
        attemptedSourceRef.current = source;
        setStatus({ kind: "ready" });
      }
      return;
    }
    // Never retry a source we already handed to the compiler: otherwise a
    // document that fails to compile is recompiled every time `status` flips.
    if (attemptedSourceRef.current === source) return;
    const elapsed = performance.now() - lastEditAtRef.current;
    const delay = Math.max(0, compileDebounceMs(lastCompileMs) - elapsed);
    const t = setTimeout(() => {
      void runCompileRef.current(sourceRef.current);
    }, delay);
    return () => clearTimeout(t);
  }, [
    source,
    compiledSource,
    autoCompile,
    status.kind,
    lastCompileMs,
    runCompileRef,
    sourceRef,
  ]);

  // ── Exports ───────────────────────────────────────────────────────────────
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
  }, [sourceRef]);

  // The preview never materialises the whole document as a string any more, so
  // the exports that need one ask the render session for it on demand.
  const downloadSvg = useCallback(async () => {
    try {
      const svg = await currentPreviewSvg();
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "document.svg");
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : "SVG export failed");
    }
  }, [flashNotice]);

  const downloadPng = useCallback(async () => {
    try {
      const blob = await svgToPngBlob(await currentPreviewSvg(), 2);
      downloadBlob(blob, "document.png");
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : "PNG export failed");
    }
  }, [flashNotice]);

  const copySource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sourceRef.current);
      flashNotice("Source copied");
    } catch {
      flashNotice("Copy failed");
    }
  }, [flashNotice, sourceRef]);

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
  }, [flashNotice, sourceRef]);

  // Download whichever page is currently in view (read from the preview pane's
  // ref, so page changes don't rerender this screen).
  const downloadCurrentPageSvg = useCallback(async () => {
    try {
      const pages = splitSvgPages(await currentPreviewSvg());
      const n = clamp(currentPageRef.current, 1, pages.length);
      const page = pages[n - 1];
      if (!page) {
        flashNotice("No page to export");
        return;
      }
      downloadBlob(
        new Blob([page.svg], { type: "image/svg+xml" }),
        `document-page-${n}.svg`,
      );
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : "Page export failed");
    }
  }, [currentPageRef, flashNotice]);

  // ── Workspace: open a .typ handed off from the sidebar; save writes back ───
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
  }, [flashNotice, wsFileName, sourceRef]);

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
  const saveAction = useCallback(() => {
    if (wsRef.current) void saveToWorkspace();
    else void downloadPdf();
  }, [saveToWorkspace, downloadPdf]);
  const saveActionRef = useLatestRef(saveAction);

  // CodeMirror extensions (stable): Typst mode, Quebi Light theme, our shortcuts.
  const extensions = useMemo(
    () => [
      typst(),
      lightThemeExtension,
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
    [runCompileRef, saveActionRef, sourceRef],
  );

  /**
   * Reveal + transiently highlight the source section at `fraction` of the
   * document. The section map is resolved lazily here (cached on the source
   * string) rather than rebuilt on every keystroke.
   */
  const revealSourceAtFraction = useCallback(
    (fraction: number) => {
      const view = editorViewRef.current;
      if (!view) return;
      const sections = sectionsForSource(sourceRef.current);
      if (sections.length === 0) return;
      const docLen = Math.max(1, view.state.doc.length);
      const idx = sectionIndexForOffset(
        sections,
        fractionToOffset(fraction, docLen),
      );
      const section = sections[idx];
      const line = view.state.doc.lineAt(
        Math.min(section.start, view.state.doc.length),
      );
      view.dispatch({
        effects: [
          EditorView.scrollIntoView(line.from, { y: "center" }),
          setSyncLine.of(line.from),
        ],
      });
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => {
        highlightTimer.current = null;
        // The view may have been destroyed in the meantime.
        try {
          editorViewRef.current?.dispatch({ effects: setSyncLine.of(null) });
        } catch {
          /* view is gone — nothing to clear */
        }
      }, HIGHLIGHT_MS);
    },
    [sourceRef],
  );

  // Timers — and the wasm-side incremental state, which describes a preview DOM
  // that is about to stop existing — outlive the component unless we say so.
  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      highlightTimer.current = null;
      noticeTimer.current = null;
      editorViewRef.current = null;
      resetPreviewSession();
    };
  }, []);

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
              <MenuItem
                onClick={() => void downloadSvg()}
                disabled={!hasDocument}
              >
                Download SVG
              </MenuItem>
              {pageCount > 1 && (
                <MenuItem
                  onClick={() => void downloadCurrentPageSvg()}
                  disabled={!hasDocument}
                >
                  Download current page (SVG)
                </MenuItem>
              )}
              <MenuItem
                onClick={() => void downloadPng()}
                disabled={!hasDocument}
              >
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
            theme="none"
            height="100%"
            style={{ height: "100%", fontSize: "13px" }}
            onCreateEditor={(view) => {
              editorViewRef.current = view;
            }}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              foldGutter: false,
              autocompletion: false,
              tabSize: 2,
            }}
          />
        </div>

        <PreviewPane
          doc={doc}
          previewHostRef={previewHostRef}
          statusKind={status.kind}
          errorMessage={status.kind === "error" ? status.message : null}
          compiledSource={compiledSource}
          pageCount={pageCount}
          currentPageRef={currentPageRef}
          onRevealSource={revealSourceAtFraction}
          onNotice={flashNotice}
        />
      </div>
    </section>
  );
}

/** The little the React tree knows about the rendered document. */
interface PreviewDoc {
  pageCount: number;
}

interface PreviewPaneProps {
  /** Null until the first compile lands; a new object after each one. */
  doc: PreviewDoc | null;
  /** Where the rendered document is patched in — see {@link SvgDocument}. */
  previewHostRef: React.RefObject<HTMLDivElement | null>;
  statusKind: Status["kind"];
  errorMessage: string | null;
  compiledSource: string;
  pageCount: number;
  currentPageRef: React.RefObject<number>;
  /** Jump the editor to the source at this fraction [0, 1] of the document. */
  onRevealSource: (fraction: number) => void;
  onNotice: (message: string) => void;
}

/**
 * The preview half of the screen.
 *
 * Split out (and memoised) so that editor-side state — above all the `source`
 * that changes on every keystroke — can't rerender the multi-megabyte rendered
 * document. Everything that only the preview cares about (zoom, render mode,
 * current page, the jump toggle) is state *here*, so it can't rerender the
 * editor either. All props are per-compile values or stable callbacks.
 */
const PreviewPane = memo(function PreviewPane({
  doc,
  previewHostRef,
  statusKind,
  errorMessage,
  compiledSource,
  pageCount,
  currentPageRef,
  onRevealSource,
  onNotice,
}: PreviewPaneProps) {
  const [zoom, setZoom] = useState(1);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("svg");
  const [currentPage, setCurrentPage] = useState(1);
  /** Gates the preview → source jump affordances (click a link, select text). */
  const [jumpEnabled, setJumpEnabled] = useState(true);
  const jumpEnabledRef = useLatestRef(jumpEnabled);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const domContainerRef = useRef<HTMLDivElement | null>(null);
  const domHandleRef = useRef<DomHandle | null>(null);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => clamp(z * factor, ZOOM_MIN, ZOOM_MAX));
  }, []);

  /** Reveal the source for a rendered-document point (page + y). */
  const revealPageTarget = useCallback(
    (container: HTMLElement, target: PageTarget) => {
      const heights = pageHeights(pageElements(container));
      if (heights.some((h) => h > 0)) {
        onRevealSource(pageTargetToFraction(heights, target));
      }
    },
    [onRevealSource],
  );

  // Scroll the preview to an in-document location (1-based page + y in pt) and
  // follow in the editor. Used by typst's internal reference links.
  const jumpToDocLocation = useCallback(
    (page: number, y: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const pages = pageElements(container);
      const pageEl = pages[page - 1];
      if (pageEl) {
        const pageHeightPt = pageHeightOf(pageEl);
        const pageRect = pageEl.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const scale = pageHeightPt > 0 ? pageRect.height / pageHeightPt : 1;
        const targetTop =
          pageRect.top - cRect.top + container.scrollTop + y * scale;
        container.scrollTo({
          top: Math.max(0, targetTop - container.clientHeight * 0.25),
          behavior: "smooth",
        });
      }
      if (jumpEnabledRef.current) revealPageTarget(container, { page, y });
    },
    [revealPageTarget, jumpEnabledRef],
  );

  // Wire typst's internal reference links. The SVG emits, per cross-reference,
  // `<a onclick="handleTypstLocation(this, page, x, y); return false">`. We
  // (1) provide the global it calls, and (2) also intercept clicks directly by
  // parsing that attribute. (2) is what actually fires: the renderer's own
  // bootstrap `<script>` never runs — it isn't part of the incremental frames,
  // and wasn't executed by `innerHTML` before them either. The listener sits on
  // the scroll container, which the preview patching never touches.
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.handleTypstLocation = (
      _elem: unknown,
      page: number,
      _x: number,
      y: number,
    ) => jumpToDocLocation(page, y);

    const container = scrollRef.current;
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
  }, [jumpToDocLocation, previewMode, statusKind]);

  // Preview text selection → reveal the corresponding section in the editor.
  // Goes through the same page/pt basis as a reference-link jump, so selecting
  // text next to a link lands in the same place clicking it would.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onPointerUp = () => {
      if (!jumpEnabledRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.top === 0 && rect.height === 0)) return;
      const target = clientYToPageTarget(pageElements(container), rect.top);
      if (target) revealPageTarget(container, target);
      // No page reports a usable size (some renderer outputs don't): fall back
      // to the scroll-content basis rather than dropping the gesture.
      else onRevealSource(containerYToFraction(container, rect.top));
    };
    container.addEventListener("pointerup", onPointerUp);
    return () => container.removeEventListener("pointerup", onPointerUp);
  }, [previewMode, statusKind, revealPageTarget, onRevealSource, jumpEnabledRef]);

  // Selectable-text (DOM render) mode: mount/refresh after each compile, with a
  // hard fallback to the SVG preview if the experimental renderer throws.
  // Deliberately keyed on `compiledSource`, never on the in-flight source.
  useEffect(() => {
    if (previewMode !== "text") {
      domHandleRef.current?.dispose();
      domHandleRef.current = null;
      return;
    }
    if (statusKind !== "ready") return;
    const container = domContainerRef.current;
    if (!container) return;
    let disposed = false;
    (async () => {
      try {
        domHandleRef.current?.dispose();
        domHandleRef.current = null;
        const handle = await renderDomInto(container, compiledSource);
        if (disposed) {
          handle.dispose();
          return;
        }
        domHandleRef.current = handle;
      } catch {
        if (!disposed) {
          onNotice("Selectable preview unavailable — using image");
          setPreviewMode("svg");
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [previewMode, statusKind, compiledSource, onNotice]);

  // Tear the DOM mount down on unmount.
  useEffect(() => {
    return () => {
      domHandleRef.current?.dispose();
      domHandleRef.current = null;
    };
  }, []);

  // Scroll the preview so page `n` (1-based) sits at the top.
  const scrollToPage = useCallback((n: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const pages = pageElements(container);
    const pageEl = pages[clamp(n, 1, pages.length) - 1];
    if (!pageEl) return;
    const cRect = container.getBoundingClientRect();
    const pRect = pageEl.getBoundingClientRect();
    container.scrollTo({
      top: Math.max(0, pRect.top - cRect.top + container.scrollTop - 8),
      behavior: "smooth",
    });
  }, []);

  // Track the current page from the scroll position (rAF-throttled).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const pages = pageElements(container);
      if (pages.length === 0) return;
      const mid =
        container.getBoundingClientRect().top + container.clientHeight / 2;
      let cur = 1;
      pages.forEach((p, i) => {
        if (p.getBoundingClientRect().top <= mid) cur = i + 1;
      });
      currentPageRef.current = cur;
      setCurrentPage((prev) => (prev === cur ? prev : cur));
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
  }, [previewMode, statusKind, doc, currentPageRef]);

  // Fit a whole page in the preview viewport (zoom = fraction of preview width).
  const fitPage = useCallback(() => {
    const container = scrollRef.current;
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
    setZoom(clamp(z, ZOOM_MIN, ZOOM_MAX));
  }, []);

  return (
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
            onClick={() => setJumpEnabled((v) => !v)}
            aria-pressed={jumpEnabled}
            title="Jump to source when a reference is clicked or preview text is selected"
            className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs transition ${
              jumpEnabled ? "text-accent" : "text-muted hover:text-accent"
            }`}
          >
            <Link2 size={13} /> Jump to source
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode((m) => (m === "svg" ? "text" : "svg"))}
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

      {statusKind === "error" && (
        <div className="flex items-start gap-2 border-b border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs">
            {errorMessage}
          </pre>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-bg p-4">
        {statusKind === "loading" ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden />
            Loading the Typst compiler…
          </div>
        ) : (
          <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
            {/* Selectable text (DOM render mode). Hidden in svg mode. It emits
                one <svg> per page, so it keeps the descendant utilities. */}
            <div
              ref={domContainerRef}
              className={`${PREVIEW_ROOT_CLASS} [&_svg]:h-auto [&_svg]:w-full [&_svg]:bg-white [&_svg]:shadow-lg ${
                previewMode === "text" ? "" : "hidden"
              }`}
            />
            {/* Rendered document. Stays mounted even while the selectable
                preview is showing: its DOM is patched in place from one compile
                to the next, so discarding it would force a full rebuild. */}
            <SvgDocument
              hostRef={previewHostRef}
              hidden={previewMode !== "svg"}
            />
            {previewMode === "svg" && !doc && (
              <div className="py-16 text-center text-muted">
                No preview yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * The rendered document — an empty element, on purpose.
 *
 * React owns this node and nothing inside it: the subtree is built once and
 * then patched in place by {@link applyPreviewFrame} as compiles land (#128).
 * Giving React children here — or unmounting the component between compiles —
 * would put React and the patcher in conflict over the same nodes and hand back
 * the wholesale rebuild this replaced. Rendering it therefore costs nothing and
 * never depends on the document, which is why it takes only a ref.
 *
 * The width/background utilities target the root `<svg>` through a child
 * combinator rather than a descendant one, so the style matcher never has to
 * walk into the tens of thousands of nodes below it.
 */
const SvgDocument = memo(function SvgDocument({
  hostRef,
  hidden,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  hidden: boolean;
}) {
  return (
    <div
      ref={hostRef}
      className={`${PREVIEW_ROOT_CLASS} [&>svg]:h-auto [&>svg]:w-full [&>svg]:bg-white [&>svg]:shadow-lg${
        hidden ? " hidden" : ""
      }`}
    />
  );
});

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
    className = "text-red-600 border-red-600/30";
  } else if (stale) {
    label = "stale";
    className = "text-amber-600 border-amber-600/30";
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
