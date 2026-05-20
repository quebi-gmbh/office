/**
 * Status bar — shows active tool, cursor position, zoom %, canvas dimensions.
 * Cursor coords are rAF-coalesced in the engine (updated at ≤60Hz).
 */
import type { EngineState } from "~/paint/lib/types";

interface StatusBarProps {
  state: EngineState;
}

const TOOL_LABELS: Record<string, string> = {
  brush: "Brush",
  pencil: "Pencil",
  eraser: "Eraser",
  line: "Line",
  rect: "Rectangle",
  ellipse: "Ellipse",
  fill: "Fill",
  eyedropper: "Eyedropper",
  text: "Text",
};

export function StatusBar({ state }: StatusBarProps) {
  const { doc, zoom, cursorDoc, tool } = state;
  const zoomPct = Math.round(zoom * 100);

  return (
    <footer className="paint-statusbar">
      <span className="paint-statusbar__tool">{TOOL_LABELS[tool] ?? tool}</span>
      <span className="paint-statusbar__sep">|</span>
      {cursorDoc ? (
        <span>
          x: {Math.round(cursorDoc.x)}&emsp;y: {Math.round(cursorDoc.y)}
        </span>
      ) : (
        <span style={{ color: "transparent" }}>x: 0&emsp;y: 0</span>
      )}
      <span className="paint-statusbar__sep">|</span>
      <span>{zoomPct} %</span>
      <span className="paint-statusbar__sep">|</span>
      <span>{doc.width} × {doc.height}</span>
    </footer>
  );
}
