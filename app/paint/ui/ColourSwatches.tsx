/**
 * Colour swatches — FG/BG pair with swap button, plus recent colours strip.
 *
 * FG/BG layout: two overlapping squares (Photoshop-style) with a ↕ swap arrow.
 * Clicking either square opens the native <input type="color"> picker.
 *
 * Recent colours: up to 10 squares, most-recent first.
 *   Click → set FG
 *   Alt-click → set BG
 *
 * NOTE: Safari allows .click() on hidden colour inputs only inside a user
 * gesture handler — our onClick is always a gesture, so this is safe.
 */
import { useRef } from "react";
import type { Engine } from "~/paint/engine";
import type { EngineState } from "~/paint/lib/types";

interface ColourSwatchesProps {
  engine: Engine;
  state: EngineState;
}

export function ColourSwatches({ engine, state }: ColourSwatchesProps) {
  const fgInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  function swapColours() {
    const prevFg = state.fg;
    engine.setFg(state.bg === "transparent" ? "#ffffff" : state.bg);
    engine.setBg(prevFg);
  }

  function onRecentClick(e: React.MouseEvent, colour: string) {
    if (e.altKey) {
      engine.setBg(colour);
    } else {
      engine.setFg(colour);
    }
  }

  return (
    <div className="paint-swatches">
      {/* FG / BG pair */}
      <div className="paint-swatches__pair">
        {/* BG behind */}
        <div
          className="paint-swatches__swatch paint-swatches__bg"
          style={{ background: state.bg === "transparent" ? "transparent" : state.bg }}
          onClick={() => bgInputRef.current?.click()}
          title="Background colour"
        >
          <input
            ref={bgInputRef}
            type="color"
            value={state.bg === "transparent" ? "#ffffff" : state.bg}
            onChange={(e) => engine.setBg(e.target.value)}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            tabIndex={-1}
          />
        </div>
        {/* FG in front */}
        <div
          className="paint-swatches__swatch paint-swatches__fg"
          style={{ background: state.fg }}
          onClick={() => fgInputRef.current?.click()}
          title="Foreground colour"
        >
          <input
            ref={fgInputRef}
            type="color"
            value={state.fg}
            onChange={(e) => engine.setFg(e.target.value)}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            tabIndex={-1}
          />
        </div>
        {/* Swap button */}
        <button
          type="button"
          className="paint-swatches__swap"
          onClick={swapColours}
          title="Swap FG / BG (X)"
          aria-label="Swap foreground and background colours"
        >
          ⇌
        </button>
      </div>

      {/* Recent colours strip */}
      {state.recentColours.length > 0 && (
        <div className="paint-swatches__recents" title="Recent colours — click: set FG, Alt-click: set BG">
          {state.recentColours.map((colour) => (
            <div
              key={colour}
              className="paint-swatches__recent"
              style={{ background: colour }}
              onClick={(e) => onRecentClick(e, colour)}
              title={colour}
            />
          ))}
        </div>
      )}
    </div>
  );
}
