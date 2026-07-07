/**
 * Paint toolbar — tool picker, size/options, colour controls, undo/redo, actions.
 * Expanded further in sub-tasks #28 (shortcuts) and #30 (full colour system).
 */
import type { ReactNode } from "react";
import {
  ChevronDown,
  Circle,
  CircleHelp,
  Download,
  Eraser,
  FilePlus,
  FolderOpen,
  Layers,
  Minus,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pencil,
  Pipette,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import type { Engine } from "~/paint/engine";
import type { EngineState, ToolId } from "~/paint/lib/types";
import { ColourSwatches } from "~/paint/ui/ColourSwatches";

interface ToolbarProps {
  engine: Engine;
  state: EngineState;
  onHelpOpen(): void;
  onNewDoc(): void;
  onOpenFile(): void;
  onExport(): void;
  onClearData(): void;
  onResize(): void;
  onScale(): void;
  /** Present only when a workspace file is open — writes back to it. */
  onSave?: () => void;
}

const TOOL_BUTTONS: Array<{ id: ToolId; icon: ReactNode; title: string }> = [
  { id: "select",     icon: <MousePointer2 size={15} aria-hidden />, title: "Select (M)"     },
  { id: "brush",      icon: <Paintbrush    size={15} aria-hidden />, title: "Brush (B)"      },
  { id: "pencil",     icon: <Pencil        size={15} aria-hidden />, title: "Pencil (P)"     },
  { id: "eraser",     icon: <Eraser        size={15} aria-hidden />, title: "Eraser (E)"     },
  { id: "line",       icon: <Minus         size={15} aria-hidden />, title: "Line (L)"       },
  { id: "rect",       icon: <Square        size={15} aria-hidden />, title: "Rectangle (R)"  },
  { id: "ellipse",    icon: <Circle        size={15} aria-hidden />, title: "Ellipse (O)"    },
  { id: "fill",       icon: <PaintBucket   size={15} aria-hidden />, title: "Fill (G)"       },
  { id: "eyedropper", icon: <Pipette       size={15} aria-hidden />, title: "Eyedropper (I)" },
  { id: "text",       icon: <Type          size={15} aria-hidden />, title: "Text (T)"       },
];

const SHAPE_TOOLS = new Set<ToolId>(["line", "rect", "ellipse"]);

export function Toolbar({ engine, state, onHelpOpen, onNewDoc, onOpenFile, onExport, onClearData, onResize, onScale, onSave }: ToolbarProps) {

  return (
    <header className="paint-toolbar">
      <h1 className="paint-toolbar__title">Paint</h1>

      {/* Tool selector */}
      <div className="paint-toolbar__tools" role="toolbar" aria-label="Drawing tools">
        {TOOL_BUTTONS.map(({ id, icon, title }) => (
          <button
            key={id}
            type="button"
            title={title}
            className={`paint-toolbar__tool${state.tool === id ? " is-active" : ""}`}
            onClick={() => engine.setTool(id)}
            aria-pressed={state.tool === id}
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="paint-toolbar__sep" />

      {/* Size — shown for drawing tools, not eyedropper/text/select */}
      {state.tool !== "eyedropper" && state.tool !== "text" && state.tool !== "select" && (
        <label className="paint-toolbar__label" title={`Size: ${state.size}px`}>
          <span>Size</span>
          <input
            type="range"
            min={1}
            max={100}
            value={state.size}
            onChange={(e) => engine.setSize(Number(e.target.value))}
            className="paint-toolbar__range"
          />
          <span className="paint-toolbar__value">{state.size}</span>
        </label>
      )}

      {/* Brush options */}
      {state.tool === "brush" && (
        <>
          <label className="paint-toolbar__label" title={`Smoothing: ${state.brush.smoothing}`}>
            <span>Smooth</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.brush.smoothing}
              onChange={(e) => engine.setBrushOption("smoothing", Number(e.target.value))}
              className="paint-toolbar__range"
            />
          </label>
          <label className="paint-toolbar__label" title={`Thinning: ${state.brush.thinning}`}>
            <span>Thin</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={state.brush.thinning}
              onChange={(e) => engine.setBrushOption("thinning", Number(e.target.value))}
              className="paint-toolbar__range"
            />
          </label>
          <label className="paint-toolbar__label" title="Taper start">
            <input
              type="checkbox"
              checked={!!state.brush.taperStart}
              onChange={(e) => engine.setBrushOption("taperStart", e.target.checked)}
            />
            <span>Taper↑</span>
          </label>
          <label className="paint-toolbar__label" title="Taper end">
            <input
              type="checkbox"
              checked={!!state.brush.taperEnd}
              onChange={(e) => engine.setBrushOption("taperEnd", e.target.checked)}
            />
            <span>Taper↓</span>
          </label>
        </>
      )}

      {/* Eraser mode */}
      {state.tool === "eraser" && (
        <label className="paint-toolbar__label">
          <span>Mode</span>
          <select
            value={state.eraserMode}
            onChange={(e) => engine.setEraserMode(e.target.value as "bg" | "erase")}
            className="paint-toolbar__select"
          >
            <option value="bg">Background</option>
            <option value="erase">Erase (alpha)</option>
          </select>
        </label>
      )}

      {/* Shape stroke/fill toggles */}
      {SHAPE_TOOLS.has(state.tool) && (
        <>
          <label className="paint-toolbar__label" title="Stroke outline">
            <input
              type="checkbox"
              checked={state.shape.stroke}
              onChange={(e) => engine.setShapeOption("stroke", e.target.checked)}
            />
            <span>Stroke</span>
          </label>
          <label className="paint-toolbar__label" title="Fill interior">
            <input
              type="checkbox"
              checked={state.shape.fill}
              onChange={(e) => engine.setShapeOption("fill", e.target.checked)}
            />
            <span>Fill</span>
          </label>
        </>
      )}

      {/* Fill tolerance */}
      {state.tool === "fill" && (
        <label className="paint-toolbar__label" title={`Tolerance: ${state.fillTolerance}`}>
          <span>Tolerance</span>
          <input
            type="range"
            min={0}
            max={255}
            value={state.fillTolerance}
            onChange={(e) => engine.setFillTolerance(Number(e.target.value))}
            className="paint-toolbar__range"
          />
          <span className="paint-toolbar__value">{state.fillTolerance}</span>
        </label>
      )}

      <div className="paint-toolbar__sep" />

      {/* Colours */}
      <ColourSwatches engine={engine} state={state} />

      <div className="paint-toolbar__sep" />

      {/* Undo / Redo */}
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        disabled={!state.canUndo}
        onClick={() => engine.undo()}
        className="paint-toolbar__btn"
      >
        <Undo2 size={14} aria-hidden /> Undo
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!state.canRedo}
        onClick={() => engine.redo()}
        className="paint-toolbar__btn"
      >
        <Redo2 size={14} aria-hidden /> Redo
      </button>

      <div className="paint-toolbar__sep" />

      {/* Canvas operations dropdown */}
      <details className="paint-toolbar__menu">
        <summary className="paint-toolbar__btn">
          <Layers size={14} aria-hidden /> Canvas <ChevronDown size={12} aria-hidden />
        </summary>
        <div className="paint-toolbar__menu-items">
          <button
            type="button"
            className="paint-toolbar__menu-item"
            disabled={!state.selection}
            title={state.selection ? "Crop canvas to selection" : "No selection — draw a marquee first"}
            onClick={() => {
              engine.cropToSelection();
              engine.fitViewport?.();
            }}
          >
            Crop to selection
          </button>
          <button
            type="button"
            className="paint-toolbar__menu-item"
            onClick={onResize}
          >
            Resize canvas…
          </button>
          <button
            type="button"
            className="paint-toolbar__menu-item"
            onClick={onScale}
          >
            Scale image…
          </button>
          <button
            type="button"
            className="paint-toolbar__menu-item"
            onClick={() => {
              engine.trimTransparent();
              engine.fitViewport?.();
            }}
          >
            Trim transparent
          </button>
        </div>
      </details>

      <div className="paint-toolbar__sep" />

      {/* File actions */}
      <button type="button" className="paint-toolbar__btn" onClick={onNewDoc} title="New document (Ctrl+N)">
        <FilePlus size={14} aria-hidden /> New
      </button>
      <button type="button" className="paint-toolbar__btn" onClick={onOpenFile} title="Open image file">
        <FolderOpen size={14} aria-hidden /> Open
      </button>
      {onSave && (
        <button type="button" className="paint-toolbar__btn" onClick={onSave} title="Save to workspace file (Ctrl+S)">
          <Save size={14} aria-hidden /> Save
        </button>
      )}
      <button type="button" className="paint-toolbar__btn" onClick={onExport} title="Export">
        <Download size={14} aria-hidden /> Export
      </button>
      <button
        type="button"
        className="paint-toolbar__btn"
        onClick={onClearData}
        title="Clear saved session data"
        style={{ color: "var(--color-muted)" }}
      >
        <Trash2 size={14} aria-hidden /> Clear
      </button>

      <div className="paint-toolbar__sep" />

      <button
        type="button"
        className="paint-toolbar__btn"
        title="Keyboard shortcuts (?)"
        onClick={onHelpOpen}
      >
        <CircleHelp size={14} aria-hidden />
      </button>
    </header>
  );
}
