/**
 * CM6 compartment registry and settings-to-extensions wiring.
 *
 * All mutable editor behaviours (everything that settings can toggle) are
 * controlled through a Compartment so they can be hot-swapped without
 * recreating the editor state.
 *
 * Usage: create one CompartmentSet per editor via `createCompartments()`, pass
 * the returned `initialExtensions` to the editor, then call `applySettings`
 * whenever settings change.
 */
import { Compartment, StateEffect } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import type { EditorView as EditorViewType } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { CodeSettings } from "./settings";
import { getThemeExtension, themeCompartment } from "./theme";
import { loadKeymap } from "./keymaps";
import { loadMinimap } from "./minimap";
import { getLinterForLang } from "./linters";

// ── Compartment instances (one per editor, created by createCompartments) ────
export type CompartmentSet = {
  lineNumbers: Compartment;
  activeLine: Compartment;
  lineWrapping: Compartment;
  indentStyle: Compartment;   // indentUnit + tabSize
  keymap: Compartment;        // vim / emacs / default (default = [])
  indentGuides: Compartment;  // lazy: @replit/codemirror-indentation-markers
  whitespace: Compartment;    // future: whitespace visualiser
  linter: Compartment;        // lazy: per-language linters (#23)
  minimap: Compartment;       // lazy: minimap (#23)
};

export function createCompartments(): CompartmentSet {
  return {
    lineNumbers: new Compartment(),
    activeLine: new Compartment(),
    lineWrapping: new Compartment(),
    indentStyle: new Compartment(),
    keymap: new Compartment(),
    indentGuides: new Compartment(),
    whitespace: new Compartment(),
    linter: new Compartment(),
    minimap: new Compartment(),
  };
}

// ── Build initial extensions from defaults ────────────────────────────────────
export function buildInitialExtensions(
  comps: CompartmentSet,
  settings: CodeSettings,
): Extension[] {
  return [
    // Theme (also managed by useAutoTheme hook). The site chrome is light-only,
    // so "auto" resolves to the light editor; "dark" is an explicit opt-in.
    themeCompartment.of(getThemeExtension(settings.theme.mode === "dark")),
    // Line numbers
    comps.lineNumbers.of(settings.display.lineNumbers ? lineNumbers() : []),
    // Active line
    comps.activeLine.of(
      settings.editor.activeLine
        ? [highlightActiveLine(), highlightActiveLineGutter()]
        : [],
    ),
    // Line wrapping
    comps.lineWrapping.of(
      settings.editor.wrap !== "off" ? EditorView.lineWrapping : [],
    ),
    // Indent style
    comps.indentStyle.of(buildIndentExtension(settings)),
    // Keymap (default = empty; vim/emacs loaded lazily in #23)
    comps.keymap.of([]),
    // Indent guides (lazy; starts disabled)
    comps.indentGuides.of([]),
    // Whitespace visualiser (future)
    comps.whitespace.of([]),
    // Linter (future: #23)
    comps.linter.of([]),
    // Minimap (future: #23)
    comps.minimap.of([]),
  ];
}

// ── Helper builders ───────────────────────────────────────────────────────────

function buildIndentExtension(settings: CodeSettings): Extension {
  const unit =
    settings.files.indent === "tabs"
      ? "\t"
      : " ".repeat(settings.files.tabWidth);
  return [
    indentUnit.of(unit),
    EditorView.editorAttributes.of({
      // Expose tab-size as a CSS attr so the editor renders tabs correctly
      style: `tab-size: ${settings.files.tabWidth}`,
    }),
  ];
}

// ── applySettings: dispatch all effects for a new settings object ─────────────
export function applySettings(
  view: EditorViewType,
  comps: CompartmentSet,
  settings: CodeSettings,
  prev?: CodeSettings,
): void {
  const effects: StateEffect<unknown>[] = [];

  const changed = <K extends keyof CodeSettings>(
    section: K,
    key: keyof CodeSettings[K],
  ) =>
    !prev ||
    (prev[section] as Record<string, unknown>)[key as string] !==
      (settings[section] as Record<string, unknown>)[key as string];

  // Theme — "auto" resolves to light (the site chrome is light-only).
  if (!prev || prev.theme.mode !== settings.theme.mode) {
    effects.push(
      themeCompartment.reconfigure(
        getThemeExtension(settings.theme.mode === "dark"),
      ),
    );
  }

  // Line numbers
  if (changed("display", "lineNumbers")) {
    effects.push(
      comps.lineNumbers.reconfigure(
        settings.display.lineNumbers ? lineNumbers() : [],
      ),
    );
  }

  // Active line
  if (changed("editor", "activeLine")) {
    effects.push(
      comps.activeLine.reconfigure(
        settings.editor.activeLine
          ? [highlightActiveLine(), highlightActiveLineGutter()]
          : [],
      ),
    );
  }

  // Line wrap
  if (changed("editor", "wrap")) {
    effects.push(
      comps.lineWrapping.reconfigure(
        settings.editor.wrap !== "off" ? EditorView.lineWrapping : [],
      ),
    );
  }

  // Indent style / tab width
  if (changed("files", "indent") || changed("files", "tabWidth")) {
    effects.push(comps.indentStyle.reconfigure(buildIndentExtension(settings)));
  }

  // Indent guides (lazy)
  if (changed("display", "indentGuides")) {
    if (settings.display.indentGuides) {
      import("@replit/codemirror-indentation-markers")
        .then(({ indentationMarkers }) => {
          view.dispatch({
            effects: comps.indentGuides.reconfigure(indentationMarkers()),
          });
        })
        .catch(console.error);
      return; // async path — skip synchronous dispatch below for this field
    } else {
      effects.push(comps.indentGuides.reconfigure([]));
    }
  }

  // Keymap (async — vim / emacs chunk fetched on first use)
  if (!prev || prev.keymap !== settings.keymap) {
    loadKeymap(settings.keymap)
      .then((ext) => {
        view.dispatch({ effects: comps.keymap.reconfigure(ext) });
      })
      .catch(console.error);
  }

  // Minimap (async — only fetched when first enabled)
  if (changed("display", "minimap")) {
    if (settings.display.minimap) {
      loadMinimap()
        .then((ext) => {
          view.dispatch({ effects: comps.minimap.reconfigure(ext) });
        })
        .catch(console.error);
    } else {
      effects.push(comps.minimap.reconfigure([]));
    }
  }

  // Apply synchronous effects
  if (effects.length > 0) {
    view.dispatch({ effects });
  }
}

// ── applyLinter ───────────────────────────────────────────────────────────────

/**
 * Reconfigure the linter compartment for the current language.
 * Called both when the active language changes and when the diagnostics
 * setting is toggled.
 */
export function applyLinter(
  view: EditorViewType,
  comps: CompartmentSet,
  langId: string,
  enabled: boolean,
): void {
  getLinterForLang(langId, enabled)
    .then((ext) => {
      view.dispatch({ effects: comps.linter.reconfigure(ext) });
    })
    .catch(console.error);
}
