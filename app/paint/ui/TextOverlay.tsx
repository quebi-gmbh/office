/**
 * Text overlay — a positioned contentEditable div rendered on top of the canvas.
 *
 * Rendered when engine.state.textOverlay is non-null.
 * On blur or Esc, calls engine.commitText() which rasterises the text onto main.
 * On empty commit (nothing typed), calls engine.cancelText() instead.
 *
 * Alignment note: textBaseline='top' is used in commitText(), so the overlay
 * has padding-top: 0 and line-height matching the canvas font lineHeight.
 */
import { useEffect, useRef } from "react";
import type { Engine } from "~/paint/engine";
import type { EngineState } from "~/paint/lib/types";

interface TextOverlayProps {
  engine: Engine;
  state: EngineState;
  /** The pixel-to-CSS scale of the canvas, so we can position correctly. */
  canvasScale: number;
}

export function TextOverlay({ engine, state, canvasScale }: TextOverlayProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const { textOverlay } = state;

  // Focus on mount.
  useEffect(() => {
    if (divRef.current) {
      divRef.current.focus();
      // Place caret at end.
      const range = document.createRange();
      range.selectNodeContents(divRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  if (!textOverlay) return null;

  const { x, y, fontSize, fontFamily } = textOverlay;
  const cssX = x * canvasScale;
  const cssY = y * canvasScale;
  const cssFontSize = fontSize * canvasScale;
  const lineHeight = cssFontSize * 1.2;

  function commit() {
    const div = divRef.current;
    if (!div) return;
    const textContent = div.innerText.trim();
    if (!textContent) {
      engine.cancelText();
    } else {
      engine.commitText(textContent, fontSize, fontFamily);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      engine.cancelText();
      return;
    }
    // Shift+Enter = line break (default); bare Enter = commit.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    // Stop tool shortcuts while typing.
    e.stopPropagation();
  }

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      className="paint-text-overlay"
      style={{
        position: "absolute",
        left: cssX,
        top: cssY,
        minWidth: "2px",
        minHeight: `${lineHeight}px`,
        fontSize: `${cssFontSize}px`,
        fontFamily,
        lineHeight: `${lineHeight}px`,
        color: state.fg,
        outline: "none",
        whiteSpace: "pre",
        caretColor: state.fg,
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
