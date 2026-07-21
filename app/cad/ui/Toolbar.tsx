/**
 * Top toolbar: document actions (new / open / save / share / export), undo/redo,
 * and feature creation (sketch on a base plane, primitives, and extrude/revolve
 * of the selected sketch).
 */
import { useState } from "react";
import {
  ChevronDown,
  Download,
  FilePlus2,
  FolderOpen,
  Plus,
  Redo2,
  Rotate3d,
  Ruler,
  Save,
  Share2,
  Undo2,
} from "lucide-react";
import { useCad, useCadStore } from "../hooks/useCad";
import {
  createBox,
  createCylinder,
  createExtrude,
  createRevolve,
  createSketch,
  createSphere,
} from "../lib/factory";
import type { PlaneId } from "../lib/types";

export function Toolbar({
  onNew,
  onOpen,
  onSave,
  onShare,
  onExport,
}: {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
  onExport: () => void;
}) {
  const store = useCadStore();
  const name = useCad((s) => s.doc.name);
  const canUndo = useCad((s) => s.canUndo);
  const canRedo = useCad((s) => s.canRedo);
  const selected = useCad((s) => s.doc.features.find((f) => f.id === s.selectedId) ?? null);
  const [addOpen, setAddOpen] = useState(false);

  const selectedSketchId = selected?.type === "sketch" ? selected.id : null;

  const btn =
    "flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm hover:border-accent disabled:opacity-40";

  function addSketch(plane: PlaneId) {
    const f = createSketch(plane);
    store.getState().addFeature(f);
    store.getState().openSketch(f.id);
    setAddOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-3 py-2">
      <button type="button" className={btn} onClick={onNew} title="New document">
        <FilePlus2 size={15} aria-hidden /> New
      </button>
      <button type="button" className={btn} onClick={onOpen} title="Open a saved document">
        <FolderOpen size={15} aria-hidden /> Open
      </button>
      <button type="button" className={btn} onClick={onSave} title="Save document">
        <Save size={15} aria-hidden /> Save
      </button>

      <span className="mx-1 h-5 w-px bg-border" />

      <button
        type="button"
        className={btn}
        onClick={() => store.getState().undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => store.getState().redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={15} aria-hidden />
      </button>

      <span className="mx-1 h-5 w-px bg-border" />

      {/* Add menu */}
      <div className="relative">
        <button type="button" className={btn} onClick={() => setAddOpen((v) => !v)}>
          <Plus size={15} aria-hidden /> Add <ChevronDown size={13} aria-hidden />
        </button>
        {addOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
            <div className="absolute left-0 z-20 mt-1 w-44 rounded-md border border-border bg-bg py-1 shadow-lg">
              <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted">Sketch on plane</div>
              {(["XY", "XZ", "YZ"] as PlaneId[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="block w-full px-3 py-1 text-left text-sm hover:bg-card"
                  onClick={() => addSketch(p)}
                >
                  {p} plane
                </button>
              ))}
              <div className="mt-1 border-t border-border px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted">
                Primitive
              </div>
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-sm hover:bg-card"
                onClick={() => {
                  store.getState().addFeature(createBox());
                  setAddOpen(false);
                }}
              >
                Box
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-sm hover:bg-card"
                onClick={() => {
                  store.getState().addFeature(createCylinder());
                  setAddOpen(false);
                }}
              >
                Cylinder
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-sm hover:bg-card"
                onClick={() => {
                  store.getState().addFeature(createSphere());
                  setAddOpen(false);
                }}
              >
                Sphere
              </button>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className={btn}
        disabled={!selectedSketchId}
        title="Extrude selected sketch"
        onClick={() => selectedSketchId && store.getState().addFeature(createExtrude(selectedSketchId))}
      >
        <Ruler size={15} aria-hidden /> Extrude
      </button>
      <button
        type="button"
        className={btn}
        disabled={!selectedSketchId}
        title="Revolve selected sketch"
        onClick={() => selectedSketchId && store.getState().addFeature(createRevolve(selectedSketchId))}
      >
        <Rotate3d size={15} aria-hidden /> Revolve
      </button>

      <span className="mx-1 h-5 w-px bg-border" />

      <button type="button" className={btn} onClick={onShare} title="Copy a share link">
        <Share2 size={15} aria-hidden /> Share
      </button>
      <button type="button" className={btn} onClick={onExport} title="Export STL / GLB / PNG">
        <Download size={15} aria-hidden /> Export
      </button>

      <span className="ml-auto truncate text-sm text-muted" title={name}>
        {name}
      </span>
    </div>
  );
}
