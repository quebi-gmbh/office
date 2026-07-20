import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { compilePdf, compileSvg, getTypst } from "./typst-runtime";
import { STARTER_DOC } from "./starter";

const STORAGE_KEY = "typst:source";
const COMPILE_DEBOUNCE_MS = 400;

type Status =
  | { kind: "loading" } // WASM + fonts loading
  | { kind: "compiling" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function loadInitialSource(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? STARTER_DOC;
  } catch {
    return STARTER_DOC;
  }
}

export function TypstEditorScreen() {
  const [source, setSource] = useState<string>(loadInitialSource);
  const [svg, setSvg] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [autoCompile, setAutoCompile] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist source to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [source]);

  const runCompile = useCallback(async (src: string) => {
    setStatus({ kind: "compiling" });
    try {
      const { svg } = await compileSvg(src);
      setSvg(svg);
      setStatus({ kind: "ready" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Preload the compiler on mount, then do the first compile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getTypst();
        if (cancelled) return;
        await runCompile(source);
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
    // Run once on mount; `source` is intentionally the initial value here.
  }, []);

  // Debounced auto-compile on edits.
  useEffect(() => {
    if (!autoCompile) return;
    if (status.kind === "loading") return; // wait for WASM to be ready
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runCompile(source);
    }, COMPILE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `runCompile` is stable; re-running only on source/autoCompile is intended.
  }, [source, autoCompile]);

  const syncGutterScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab inserts two spaces instead of moving focus.
      if (e.key === "Tab") {
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart, selectionEnd, value } = el;
        const next =
          value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
        setSource(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = selectionStart + 2;
        });
      }
      // Cmd/Ctrl+Enter forces a compile.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runCompile(source);
      }
    },
    [source, runCompile],
  );

  const lineNumbers = useMemo(() => {
    const count = source.split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [source]);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const bytes = await compilePdf(source);
      const blob = new Blob([bytes.slice()], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDownloading(false);
    }
  }, [source]);

  const busy = status.kind === "loading" || status.kind === "compiling";

  return (
    <section className="flex h-[calc(100vh-9rem)] min-h-[30rem] flex-col">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Typst editor</h1>
        <StatusPill status={status} />
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="accent-accent"
            />
            Auto-compile
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
            onClick={() => void handleDownloadPdf()}
            disabled={busy || downloading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Download size={15} aria-hidden />
            )}
            Download PDF
          </button>
        </div>
      </div>

      {/* Split panes */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        {/* Editor */}
        <div className="flex min-h-0 overflow-hidden rounded-xl border border-border bg-card font-mono text-sm">
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="select-none overflow-hidden border-r border-border bg-bg/40 px-2 py-3 text-right text-muted/60"
          >
            {lineNumbers.map((n) => (
              <div key={n} className="leading-6">
                {n}
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncGutterScroll}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            className="min-h-0 flex-1 resize-none bg-transparent px-3 py-3 leading-6 text-fg outline-none"
            aria-label="Typst source"
          />
        </div>

        {/* Preview */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
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
                className="typst-preview mx-auto w-fit [&_svg]:h-auto [&_svg]:max-w-full [&_svg]:shadow-lg"
                // The SVG is produced by our own local WASM compiler from the
                // user's own input — no external/untrusted HTML involved.
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

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status["kind"], { label: string; className: string }> = {
    loading: { label: "loading…", className: "text-muted border-muted/30" },
    compiling: {
      label: "compiling…",
      className: "text-accent border-accent/30",
    },
    ready: { label: "ready", className: "text-accent border-accent/30" },
    error: { label: "error", className: "text-red-500 border-red-500/30" },
  };
  const { label, className } = map[status.kind];
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
