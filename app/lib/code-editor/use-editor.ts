/**
 * Core editor hook.
 *
 * Returns the CM extension array (stable across renders — values are updated
 * via compartment.reconfigure), imperative helpers, and status-bar state.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { useAutoTheme } from "./theme";
import { noLanguage, langById } from "./languages";
import type { Lang } from "./languages";
import { createStatusPlugin } from "./status-bar";
import {
  createCompartments,
  buildInitialExtensions,
  applySettings as applySettingsImpl,
  applyLinter,
} from "./compartments";
import type { CodeSettings } from "./settings";
import { defaults } from "./settings";

export type UseEditorReturn = {
  extensions: Extension[];
  statusStore: ReturnType<typeof createStatusPlugin>[1];
  activeLang: Lang;
  setLanguage: (id: string) => Promise<void>;
  applySettings: (settings: CodeSettings, prev?: CodeSettings) => void;
  /** Assign to onCreateEditor prop of <CodeMirror /> */
  onCreateEditor: (view: EditorView) => void;
  viewRef: RefObject<EditorView | null>;
};

export function useEditor(initialSettings: CodeSettings = defaults): UseEditorReturn {
  const viewRef = useRef<EditorView | null>(null);
  // Track latest settings so async ops (language change) can read current state
  const settingsRef = useRef<CodeSettings>(initialSettings);

  // Language state — also kept in a ref so async callbacks see latest value
  const [activeLang, setActiveLang] = useState<Lang>(noLanguage);
  const activeLangRef = useRef<Lang>(noLanguage);

  // Stable per-editor instances — created once
  const langCompartment = useMemo(() => new Compartment(), []);
  const comps = useMemo(() => createCompartments(), []);
  const [statusPlugin, statusStore] = useMemo(() => createStatusPlugin(), []);

  // Wire auto-theme observer
  useAutoTheme(viewRef, initialSettings.theme.mode);

  const extensions = useMemo<Extension[]>(
    () => [
      ...buildInitialExtensions(comps, initialSettings),
      langCompartment.of([]),
      keymap.of([indentWithTab]),
      statusPlugin,
    ],
    // Intentionally stable — values are reconfigured imperatively
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);

  const setLanguage = useCallback(
    async (id: string) => {
      const lang = langById.get(id) ?? noLanguage;
      const ext = await lang.load();
      const view = viewRef.current;
      if (view) {
        view.dispatch({ effects: langCompartment.reconfigure(ext) });
        // Update linter for the new language using current diagnostics setting
        applyLinter(view, comps, lang.id, settingsRef.current.editor.diagnostics);
      }
      activeLangRef.current = lang;
      setActiveLang(lang);
    },
    [langCompartment, comps],
  );

  const applySettings = useCallback(
    (settings: CodeSettings, prev?: CodeSettings) => {
      const view = viewRef.current;
      if (!view) return;
      settingsRef.current = settings;
      applySettingsImpl(view, comps, settings, prev);
      // Re-apply linter when diagnostics toggle changes
      if (!prev || prev.editor.diagnostics !== settings.editor.diagnostics) {
        applyLinter(view, comps, activeLangRef.current.id, settings.editor.diagnostics);
      }
    },
    [comps],
  );

  return {
    extensions,
    statusStore,
    activeLang,
    setLanguage,
    applySettings,
    onCreateEditor,
    viewRef,
  };
}
