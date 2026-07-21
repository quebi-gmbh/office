/**
 * The parametric feature tree: an ordered, editable list of sketches and
 * features. Select to inspect, double-click a sketch to edit it, reorder,
 * toggle suppression, or delete. Editing anything re-evaluates downstream.
 */
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Cylinder,
  Eye,
  EyeOff,
  Box as BoxIcon,
  Pencil,
  Ruler,
  Rotate3d,
  Trash2,
} from "lucide-react";
import { useCad, useCadStore } from "../hooks/useCad";
import type { Feature } from "../lib/types";

function featureIcon(f: Feature) {
  switch (f.type) {
    case "sketch":
      return <Pencil size={14} aria-hidden />;
    case "extrude":
      return <Ruler size={14} aria-hidden />;
    case "revolve":
      return <Rotate3d size={14} aria-hidden />;
    case "box":
      return <BoxIcon size={14} aria-hidden />;
    case "cylinder":
      return <Cylinder size={14} aria-hidden />;
    case "sphere":
      return <Circle size={14} aria-hidden />;
  }
}

export function FeatureTree() {
  const store = useCadStore();
  const features = useCad((s) => s.doc.features);
  const selectedId = useCad((s) => s.selectedId);
  const editingSketchId = useCad((s) => s.editingSketchId);

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Feature tree
      </div>
      <ul className="min-h-0 flex-1 overflow-auto p-1 text-sm">
        {features.length === 0 && (
          <li className="px-2 py-3 text-xs leading-relaxed text-muted">
            Add a primitive, or start a sketch and extrude it, from the toolbar.
          </li>
        )}
        {features.map((f, i) => {
          const active = f.id === selectedId;
          const editing = f.id === editingSketchId;
          return (
            <li
              key={f.id}
              className={`group flex items-center gap-1.5 rounded px-2 py-1 ${
                active ? "bg-bg text-accent" : "hover:bg-bg"
              } ${f.suppressed ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => store.getState().select(f.id)}
                onDoubleClick={() => {
                  if (f.type === "sketch") store.getState().openSketch(f.id);
                }}
                title={f.type === "sketch" ? "Double-click to edit sketch" : undefined}
              >
                {featureIcon(f)}
                <span className="truncate">{f.name}</span>
                {editing && <span className="text-[0.6rem] text-accent">editing</span>}
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                {f.type === "sketch" && (
                  <button
                    type="button"
                    title="Edit sketch"
                    className="rounded p-0.5 text-muted hover:text-fg"
                    onClick={() => store.getState().openSketch(f.id)}
                  >
                    <Pencil size={12} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  title={f.suppressed ? "Unsuppress" : "Suppress"}
                  className="rounded p-0.5 text-muted hover:text-fg"
                  onClick={() =>
                    store.getState().update((d) => {
                      const t = d.features.find((x) => x.id === f.id);
                      if (t) t.suppressed = !t.suppressed;
                    })
                  }
                >
                  {f.suppressed ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
                </button>
                <button
                  type="button"
                  title="Move up"
                  disabled={i === 0}
                  className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30"
                  onClick={() => store.getState().moveFeature(f.id, -1)}
                >
                  <ChevronUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  title="Move down"
                  disabled={i === features.length - 1}
                  className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30"
                  onClick={() => store.getState().moveFeature(f.id, 1)}
                >
                  <ChevronDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  title="Delete"
                  className="rounded p-0.5 text-muted hover:text-red-400"
                  onClick={() => store.getState().removeFeature(f.id)}
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
