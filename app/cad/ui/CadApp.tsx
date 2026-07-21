/**
 * Root composition for the CAD tool. Wires the document store (via
 * {@link CadProvider}) to the toolbar, feature tree, 3-D viewport / 2-D sketch
 * editor, inspector, status bar, dialogs, autosave-restore, and share-by-URL.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CadProvider, useCad, useCadStore } from "../hooks/useCad";
import { clearAutosave, loadAutosave, loadAutosaveMeta, loadNamedDoc, saveNamedDoc } from "../io/autosave";
import { newDoc } from "../lib/factory";
import { readShareFromHash } from "../lib/serialize";
import type { CadDoc } from "../lib/types";
import { FeatureTree } from "./FeatureTree";
import { Inspector } from "./Inspector";
import { SketchEditor } from "./SketchEditor";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { ViewportView } from "./ViewportView";
import { ExportDialog, NewDocDialog, OpenDialog, RestoreBanner, SaveDialog, ShareDialog } from "./dialogs";

function initialDoc(): CadDoc {
  if (typeof window !== "undefined") {
    const shared = readShareFromHash(window.location.hash);
    if (shared) return shared;
  }
  return newDoc();
}

export function CadApp() {
  const [doc] = useState(initialDoc);
  return (
    <CadProvider initialDoc={doc}>
      <CadShell />
    </CadProvider>
  );
}

function CadShell() {
  const store = useCadStore();
  const editingSketchId = useCad((s) => s.editingSketchId);
  const docName = useCad((s) => s.doc.name);

  const [dialog, setDialog] = useState<null | "new" | "open" | "save" | "share" | "export">(null);
  const [restore, setRestore] = useState<null | { name: string }>(null);
  const snapshotRef = useRef<() => string>(() => "");

  const registerSnapshot = useCallback((fn: () => string) => {
    snapshotRef.current = fn;
  }, []);

  // Offer to restore the last autosaved session (unless we loaded a shared doc).
  useEffect(() => {
    if (typeof window !== "undefined" && readShareFromHash(window.location.hash)) return;
    const saved = loadAutosave();
    const meta = loadAutosaveMeta();
    if (saved && saved.features.length > 0 && store.getState().doc.features.length === 0) {
      setRestore({ name: meta?.name ?? saved.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo/redo keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.getState().undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        store.getState().redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <section
      className="flex h-[calc(100vh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-border"
      data-full-bleed
    >
      {restore && (
        <RestoreBanner
          name={restore.name}
          onRestore={() => {
            const saved = loadAutosave();
            if (saved) store.getState().setDoc(saved);
            setRestore(null);
          }}
          onDiscard={() => {
            clearAutosave();
            setRestore(null);
          }}
        />
      )}

      <Toolbar
        onNew={() => setDialog("new")}
        onOpen={() => setDialog("open")}
        onSave={() => setDialog("save")}
        onShare={() => setDialog("share")}
        onExport={() => setDialog("export")}
      />

      <div className="flex min-h-0 flex-1">
        <FeatureTree />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ViewportView registerSnapshot={registerSnapshot} />
          {editingSketchId && (
            <div className="absolute inset-0 z-10 flex flex-col bg-bg">
              <SketchEditor sketchId={editingSketchId} />
            </div>
          )}
        </div>
        <Inspector />
      </div>

      <StatusBar />

      {dialog === "new" && (
        <NewDocDialog
          onClose={() => setDialog(null)}
          onConfirm={(name) => {
            store.getState().setDoc(newDoc(name));
            clearAutosave();
            setDialog(null);
          }}
        />
      )}
      {dialog === "open" && (
        <OpenDialog
          onClose={() => setDialog(null)}
          onOpen={(name) => {
            const d = loadNamedDoc(name);
            if (d) store.getState().setDoc(d);
            setDialog(null);
          }}
        />
      )}
      {dialog === "save" && (
        <SaveDialog
          initialName={docName}
          onClose={() => setDialog(null)}
          onConfirm={(name) => {
            store.getState().update((d) => {
              d.name = name;
            });
            saveNamedDoc(store.getState().doc);
            setDialog(null);
          }}
        />
      )}
      {dialog === "share" && <ShareDialog doc={store.getState().doc} onClose={() => setDialog(null)} />}
      {dialog === "export" && <ExportDialog snapshot={() => snapshotRef.current()} onClose={() => setDialog(null)} />}
    </section>
  );
}
