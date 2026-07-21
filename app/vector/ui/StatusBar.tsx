/** Bottom status bar: zoom %, document size, selection count, pointer readout. */
import type { VectorState } from "~/vector/lib/types";

export function StatusBar({ state, pointer }: { state: VectorState; pointer: { x: number; y: number } | null }) {
  return (
    <div className="flex items-center gap-4 border-t border-border bg-card px-4 py-1.5 font-mono text-xs text-muted">
      <span>{Math.round(state.view.zoom * 100)}%</span>
      <span>
        {Math.round(state.doc.width)} × {Math.round(state.doc.height)} px
      </span>
      <span>{state.nodes.length} objects</span>
      {state.selection.length > 0 && <span className="text-accent">{state.selection.length} selected</span>}
      <span className="ml-auto">
        {pointer ? `x ${Math.round(pointer.x)}, y ${Math.round(pointer.y)} px` : "—"}
      </span>
    </div>
  );
}
