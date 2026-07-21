/**
 * Root composition for the vector editor. Wires the engine, viewport, keyboard
 * shortcuts, autosave/restore, import/export, and lays out the toolbar, canvas
 * (+ optional rulers), inspector, and status bar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVectorEditor } from "~/vector/hooks/useVectorEditor";
import { useViewport } from "~/vector/hooks/useViewport";
import { useShortcuts } from "~/vector/hooks/useShortcuts";
import { Toolbar } from "~/vector/ui/Toolbar";
import { Canvas } from "~/vector/ui/Canvas";
import { Inspector } from "~/vector/ui/Inspector";
import { StatusBar } from "~/vector/ui/StatusBar";
import { Rulers } from "~/vector/ui/Rulers";
import { NewDocDialog } from "~/vector/ui/NewDocDialog";
import { ExportDialog } from "~/vector/ui/ExportDialog";
import { RestoreBanner } from "~/vector/ui/RestoreBanner";
import { clearAutosave, loadAutosave } from "~/vector/io/autosave";
import { importSvg } from "~/vector/io/import";

export function VectorApp() {
  const { engine, state } = useVectorEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(engine, containerRef);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newDocOpen, setNewDocOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showRulers, setShowRulers] = useState(true);
  const [restore, setRestore] = useState<null | { restore: () => void }>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  // ─── Restore prompt + fit on mount ─────────────────────────────────────────
  useEffect(() => {
    const saved = loadAutosave();
    if (saved && saved.nodes.length > 0) {
      setRestore({
        restore: () => {
          engine.loadScene(saved);
          requestAnimationFrame(() => viewport.fit());
        },
      });
    }
    requestAnimationFrame(() => viewport.fit());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Pointer readout for the status bar ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const [x, y] = viewport.screenToDoc(e.clientX, e.clientY);
      setPointer({ x, y });
    };
    const onLeave = () => setPointer(null);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [viewport]);

  // ─── Import ─────────────────────────────────────────────────────────────────
  const triggerImport = useCallback(() => fileInputRef.current?.click(), []);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const result = importSvg(text);
    if (!result) {
      alert("Could not parse that SVG file.");
      return;
    }
    engine.loadScene(result.scene);
    requestAnimationFrame(() => viewport.fit());
  }

  // ─── Shortcuts ──────────────────────────────────────────────────────────────
  const shortcutHandlers = useMemo(
    () => ({
      onExport: () => setExportOpen(true),
      onImport: triggerImport,
      onZoomToSelection: viewport.zoomToSelection,
      onFit: viewport.fit,
      onResetZoom: viewport.resetZoom,
    }),
    [triggerImport, viewport],
  );
  useShortcuts(engine, shortcutHandlers);

  const zoomStep = (factor: number) => {
    const el = containerRef.current;
    const r = el?.getBoundingClientRect();
    viewport.zoomAt((r?.left ?? 0) + (r?.width ?? 0) / 2, (r?.top ?? 0) + (r?.height ?? 0) / 2, factor);
  };

  return (
    <section className="flex h-[calc(100vh-8rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-border">
      {restore && (
        <RestoreBanner
          onRestore={() => {
            restore.restore();
            setRestore(null);
          }}
          onDiscard={() => {
            clearAutosave();
            setRestore(null);
          }}
        />
      )}

      <Toolbar
        engine={engine}
        state={state}
        onNewDoc={() => setNewDocOpen(true)}
        onImport={triggerImport}
        onExport={() => setExportOpen(true)}
        onFit={viewport.fit}
        onZoomIn={() => zoomStep(1.2)}
        onZoomOut={() => zoomStep(1 / 1.2)}
        showRulers={showRulers}
        onToggleRulers={() => setShowRulers((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Canvas engine={engine} state={state} viewport={viewport} containerRef={containerRef} />
          {showRulers && (
            <Rulers
              view={state.view}
              width={containerRef.current?.clientWidth ?? 0}
              height={containerRef.current?.clientHeight ?? 0}
            />
          )}
        </div>
        <Inspector engine={engine} state={state} />
      </div>

      <StatusBar state={state} pointer={pointer} />

      <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={onFile} />

      {newDocOpen && (
        <NewDocDialog
          onClose={() => setNewDocOpen(false)}
          onConfirm={(w, h, bg) => {
            engine.newDocument(w, h, bg);
            setNewDocOpen(false);
            requestAnimationFrame(() => viewport.fit());
          }}
        />
      )}
      {exportOpen && <ExportDialog scene={engine.scene()} onClose={() => setExportOpen(false)} />}
    </section>
  );
}
