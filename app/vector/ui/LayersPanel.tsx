/**
 * Layers panel — the flat node list presented top-most-first, with per-node
 * show/hide, lock, rename, per-layer opacity and reorder (drag or the ▲▼
 * buttons). Selecting a row selects the node on the canvas.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import type { VectorEngine } from "~/vector/lib/engine";
import type { VNode, VectorState } from "~/vector/lib/types";

interface Props {
  engine: VectorEngine;
  state: VectorState;
}

function nodeLabel(n: VNode): string {
  if (n.name) return n.name;
  if (n.type === "polyline") return n.closed ? "shape" : "polyline";
  return n.type;
}

export function LayersPanel({ engine, state }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  // Top-most first (render order is bottom→top, so reverse for display).
  const rows = [...state.nodes].reverse();
  const n = state.nodes.length;

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-card">
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Layers
      </h3>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <p className="px-3 py-4 text-xs text-muted">No objects yet.</p>}
        {rows.map((node) => {
          const arrIndex = state.nodes.indexOf(node);
          const selected = state.selection.includes(node.id);
          return (
            <LayerRow
              key={node.id}
              node={node}
              selected={selected}
              grouped={!!node.groupId}
              onSelect={(additive) => (additive ? engine.toggleInSelection(node.id) : engine.select([node.id]))}
              onRename={(name) => engine.rename(node.id, name)}
              onToggleHidden={() => engine.setHidden([node.id], !node.hidden)}
              onToggleLocked={() => engine.setLocked([node.id], !node.locked)}
              onOpacity={(o) => engine.updateNodes([node.id], (x) => ({ ...x, opacity: o }))}
              onUp={arrIndex < n - 1 ? () => engine.reorder(node.id, arrIndex + 1) : undefined}
              onDown={arrIndex > 0 ? () => engine.reorder(node.id, arrIndex - 1) : undefined}
              onDragStart={() => setDragId(node.id)}
              onDrop={() => {
                if (dragId && dragId !== node.id) engine.reorder(dragId, arrIndex);
                setDragId(null);
              }}
            />
          );
        })}
      </div>
    </aside>
  );
}

function LayerRow({
  node,
  selected,
  grouped,
  onSelect,
  onRename,
  onToggleHidden,
  onToggleLocked,
  onOpacity,
  onUp,
  onDown,
  onDragStart,
  onDrop,
}: {
  node: VNode;
  selected: boolean;
  grouped: boolean;
  onSelect: (additive: boolean) => void;
  onRename: (name: string) => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onOpacity: (o: number) => void;
  onUp?: () => void;
  onDown?: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={(e) => onSelect(e.shiftKey)}
      className={`group flex items-center gap-1 border-b border-border/50 px-2 py-1 text-sm ${
        selected ? "bg-accent/15 text-accent" : "text-fg hover:bg-bg"
      }`}
    >
      <button
        type="button"
        title={node.hidden ? "Show" : "Hide"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleHidden();
        }}
        className="text-muted hover:text-fg"
      >
        {node.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        title={node.locked ? "Unlock" : "Lock"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLocked();
        }}
        className="text-muted hover:text-fg"
      >
        {node.locked ? <Lock size={14} /> : <LockOpen size={14} />}
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim()) onRename(draft.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (draft.trim()) onRename(draft.trim());
              setEditing(false);
            } else if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-border bg-bg px-1 text-xs text-fg"
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(node.name ?? nodeLabel(node));
            setEditing(true);
          }}
          title={`${nodeLabel(node)}${grouped ? " · grouped" : ""}`}
        >
          {nodeLabel(node)}
          {grouped && <span className="ml-1 text-[10px] text-muted">◇</span>}
        </span>
      )}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={node.opacity}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onOpacity(parseFloat(e.target.value))}
        title="Layer opacity"
        className="hidden w-12 accent-accent group-hover:block"
      />
      <div className="flex flex-col">
        <button
          type="button"
          disabled={!onUp}
          onClick={(e) => {
            e.stopPropagation();
            onUp?.();
          }}
          className="text-muted hover:text-fg disabled:opacity-20"
          title="Move up"
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          disabled={!onDown}
          onClick={(e) => {
            e.stopPropagation();
            onDown?.();
          }}
          className="text-muted hover:text-fg disabled:opacity-20"
          title="Move down"
        >
          <ChevronDown size={12} />
        </button>
      </div>
    </div>
  );
}
