/**
 * Top toolbar: tool picker + document/edit/z-order/view actions. Purely
 * presentational — every action delegates to the engine or a prop callback.
 */
import {
  BringToFront,
  Circle,
  CopyPlus,
  Download,
  FilePlus2,
  Grid2x2,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  PenTool,
  Pencil,
  Ruler,
  RectangleHorizontal,
  Redo2,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ComponentType } from "react";
import type { VectorEngine } from "~/vector/lib/engine";
import type { ToolId, VectorState } from "~/vector/lib/types";

interface Props {
  engine: VectorEngine;
  state: VectorState;
  onNewDoc: () => void;
  onImport: () => void;
  onExport: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showRulers: boolean;
  onToggleRulers: () => void;
}

const TOOLS: { id: ToolId; icon: ComponentType<{ size?: number }>; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select", key: "V" },
  { id: "rect", icon: Square, label: "Rectangle", key: "R" },
  { id: "rounded-rect", icon: RectangleHorizontal, label: "Rounded rectangle", key: "" },
  { id: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
  { id: "line", icon: Minus, label: "Line", key: "L" },
  { id: "polyline", icon: Waypoints, label: "Polyline", key: "" },
  { id: "pen", icon: PenTool, label: "Pen (click to place points)", key: "P" },
  { id: "pencil", icon: Pencil, label: "Pencil (freehand)", key: "B" },
  { id: "text", icon: Type, label: "Text", key: "T" },
];

function btnClass(active: boolean): string {
  return [
    "flex h-9 w-9 items-center justify-center rounded-md border transition",
    active
      ? "border-accent bg-accent/15 text-accent"
      : "border-transparent text-muted hover:border-border hover:bg-card hover:text-fg",
  ].join(" ");
}

function IconBtn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${btnClass(!!active)} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />;
}

export function Toolbar({
  engine,
  state,
  onNewDoc,
  onImport,
  onExport,
  onFit,
  onZoomIn,
  onZoomOut,
  showRulers,
  onToggleRulers,
}: Props) {
  const hasSelection = state.selection.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card px-3 py-2">
      {/* Tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <IconBtn
              key={t.id}
              title={t.key ? `${t.label} (${t.key})` : t.label}
              active={state.tool === t.id}
              onClick={() => engine.setTool(t.id)}
            >
              <Icon size={18} />
            </IconBtn>
          );
        })}
      </div>

      <Divider />

      {/* History */}
      <IconBtn title="Undo (⌘Z)" disabled={!state.canUndo} onClick={() => engine.undo()}>
        <Undo2 size={18} />
      </IconBtn>
      <IconBtn title="Redo (⌘⇧Z)" disabled={!state.canRedo} onClick={() => engine.redo()}>
        <Redo2 size={18} />
      </IconBtn>

      <Divider />

      {/* Selection ops */}
      <IconBtn title="Duplicate (⌘D)" disabled={!hasSelection} onClick={() => engine.duplicateSelection()}>
        <CopyPlus size={18} />
      </IconBtn>
      <IconBtn title="Delete (⌫)" disabled={!hasSelection} onClick={() => engine.deleteSelection()}>
        <Trash2 size={18} />
      </IconBtn>
      <IconBtn title="Bring to front (⌘])" disabled={!hasSelection} onClick={() => engine.bringToFront()}>
        <BringToFront size={18} />
      </IconBtn>
      <IconBtn title="Send to back (⌘[)" disabled={!hasSelection} onClick={() => engine.sendToBack()}>
        <SendToBack size={18} />
      </IconBtn>

      <Divider />

      {/* Grid / snap / rulers */}
      <IconBtn title="Show grid" active={state.grid.show} onClick={() => engine.setGrid({ show: !state.grid.show })}>
        <Grid2x2 size={18} />
      </IconBtn>
      <IconBtn title="Snap to grid" active={state.grid.snap} onClick={() => engine.setGrid({ snap: !state.grid.snap })}>
        <Magnet size={18} />
      </IconBtn>
      <IconBtn title="Toggle rulers" active={showRulers} onClick={onToggleRulers}>
        <Ruler size={18} />
      </IconBtn>

      <Divider />

      {/* View */}
      <IconBtn title="Zoom in" onClick={onZoomIn}>
        <ZoomIn size={18} />
      </IconBtn>
      <IconBtn title="Zoom out" onClick={onZoomOut}>
        <ZoomOut size={18} />
      </IconBtn>
      <IconBtn title="Fit to screen (⌘1)" onClick={onFit}>
        <Maximize size={18} />
      </IconBtn>

      <div className="ml-auto flex items-center gap-1">
        <IconBtn title="New document" onClick={onNewDoc}>
          <FilePlus2 size={18} />
        </IconBtn>
        <IconBtn title="Import SVG (⌘O)" onClick={onImport}>
          <Upload size={18} />
        </IconBtn>
        <IconBtn title="Export (⌘S)" onClick={onExport}>
          <Download size={18} />
        </IconBtn>
      </div>
    </div>
  );
}
