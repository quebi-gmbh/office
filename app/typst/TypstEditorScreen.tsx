import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  AlertTriangle,
  Download,
  Loader2,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { compilePdf, compileSvg, getTypst } from "./typst-runtime";
import { STARTER_DOC } from "./starter";
import { typst } from "./typst-language";
import {
  downloadBlob,
  hashToSource,
  sourceToHash,
  svgToPngBlob,
} from "./export-utils";

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // CodeMirror extensions (stable): Typst mode, dark theme, our shortcuts.
  const extensions = useMemo(
    () => [
      typst(),
      oneDark,
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
            void downloadPdfRef.current();
            return true;
          },
        },
      ]),
    ],
    [],
  );

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
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
              <MenuItem onClick={downloadSvg} disabled={!svg}>
                Download SVG
              </MenuItem>
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
          </div>

          {status.kind === "error" && (
            <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs">
                {status.message}
              </pre>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-bg p-4">
            {status.kind === "loading" ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted">
                <Loader2 size={18} className="animate-spin" aria-hidden />
                Loading the Typst compiler…
              </div>
            ) : svg ? (
              <div
                className="mx-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:shadow-lg"
                style={{ width: `${zoom * 100}%` }}
                // Produced by our own local WASM compiler from the user's own
                // input — no external/untrusted HTML.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted">
                No preview yet.
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
