/**
 * Paint toolbar — tool picker, size/options, colour controls, undo/redo, actions.
 * Expanded further in sub-tasks #28 (shortcuts) and #30 (full colour system).
 */
import type { Engine } from "~/paint/engine";
import type { EngineState, ToolId } from "~/paint/lib/types";

interface ToolbarProps {
  engine: Engine;
  state: EngineState;
  onHelpOpen(): void;
}

const TOOL_BUTTONS: Array<{ id: ToolId; label: string; title: string }> = [
  { id: "brush",      label: "B",  title: "Brush (B)"      },
  { id: "pencil",     label: "P",  title: "Pencil (P)"     },
  { id: "eraser",     label: "E",  title: "Eraser (E)"     },
  { id: "line",       label: "L",  title: "Line (L)"       },
  { id: "rect",       label: "R",  title: "Rectangle (R)"  },
  { id: "ellipse",    label: "O",  title: "Ellipse (O)"    },
  { id: "fill",       label: "G",  title: "Fill (G)"       },
  { id: "eyedropper", label: "I",  title: "Eyedropper (I)" },
  { id: "text",       label: "T",  title: "Text (T)"       },
];

const SHAPE_TOOLS = new Set<ToolId>(["line", "rect", "ellipse"]);

export function Toolbar({ engine, state, onHelpOpen }: ToolbarProps) {
  function download() {
    const canvas = document.querySelector<HTMLCanvasElement>(".paint-canvas-main");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
    a.download = `paint-${ts}.png`;
    a.click();
  }

  function clear() {
    engine.newDocument(
      state.doc.width,
      state.doc.height,
      state.doc.bgWasTransparent ? "transparent" : state.bg,
    );
  }

  return (
    <header className="paint-toolbar">
      <h1 className="paint-toolbar__title">Paint</h1>

      {/* Tool selector */}
      <div className="paint-toolbar__tools" role="toolbar" aria-label="Drawing tools">
        {TOOL_BUTTONS.map(({ id, label, title }) => (
          <button
            key={id}
            type="button"
            title={title}
            className={`paint-toolbar__tool${state.tool === id ? " is-active" : ""}`}
            onClick={() => engine.setTool(id)}
            aria-pressed={state.tool === id}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="paint-toolbar__sep" />

      {/* Size — shown for drawing tools, not eyedropper/text */}
      {state.tool !== "eyedropper" && state.tool !== "text" && (
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
      <div className="paint-toolbar__colours">
        <label className="paint-toolbar__colour-label" title="Foreground colour">
          <span className="paint-toolbar__colour-name">FG</span>
          <input
            type="color"
            value={state.fg}
            onChange={(e) => engine.setFg(e.target.value)}
            className="paint-toolbar__colour-input"
          />
        </label>
        <label className="paint-toolbar__colour-label" title="Background colour">
          <span className="paint-toolbar__colour-name">BG</span>
          <input
            type="color"
            value={state.bg === "transparent" ? "#ffffff" : state.bg}
            onChange={(e) => engine.setBg(e.target.value)}
            className="paint-toolbar__colour-input"
          />
        </label>
      </div>

      <div className="paint-toolbar__sep" />

      {/* Undo / Redo */}
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        disabled={!state.canUndo}
        onClick={() => engine.undo()}
        className="paint-toolbar__btn"
      >
        ↩ Undo
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!state.canRedo}
        onClick={() => engine.redo()}
        className="paint-toolbar__btn"
      >
        ↪ Redo
      </button>

      <div className="paint-toolbar__sep" />

      {/* Actions */}
      <button type="button" className="paint-toolbar__btn" onClick={clear} title="New document">
        New
      </button>
      <button type="button" className="paint-toolbar__btn" onClick={download} title="Download as PNG">
        ↓ PNG
      </button>

      <div className="paint-toolbar__sep" />

      <button
        type="button"
        className="paint-toolbar__btn"
        title="Keyboard shortcuts (?)"
        onClick={onHelpOpen}
      >
        ?
      </button>
    </header>
  );
}
