/**
 * Core editor hook.
 *
 * Returns the extension array to pass to <CodeMirror extensions={...}> and
 * imperative helpers that the route component and status bar can call.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { themeCompartment, getThemeExtension, useAutoTheme } from "./theme";
import { noLanguage, langById } from "./languages";
import type { Lang } from "./languages";
import { createStatusPlugin } from "./status-bar";

export type UseEditorReturn = {
  extensions: Extension[];
  statusStore: ReturnType<typeof createStatusPlugin>[1];
  activeLang: Lang;
  setLanguage: (id: string) => Promise<void>;
  /** Assign to onCreateEditor prop of <CodeMirror /> */
  onCreateEditor: (view: EditorView) => void;
  viewRef: RefObject<EditorView | null>;
};

export function useEditor(): UseEditorReturn {
  const viewRef = useRef<EditorView | null>(null);

  // Track active language in state so the status bar re-renders on change
  const [activeLang, setActiveLang] = useState<Lang>(noLanguage);

  // Stable Compartment instances
  const langCompartment = useMemo(() => new Compartment(), []);

  // Status plugin — stable pair
  const [statusPlugin, statusStore] = useMemo(() => createStatusPlugin(), []);

  // Wire auto-theme observer (runs after mount when viewRef is populated)
  useAutoTheme(viewRef, "auto");

  const isDark =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: dark)").matches;

  const extensions = useMemo<Extension[]>(
    () => [
      themeCompartment.of(getThemeExtension(isDark)),
      langCompartment.of([]),
      keymap.of([indentWithTab]),
      statusPlugin,
    ],
    // These are intentionally stable — values are reconfigured imperatively
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
      }
      setActiveLang(lang);
    },
    [langCompartment],
  );

  return {
    extensions,
    statusStore,
    activeLang,
    setLanguage,
    onCreateEditor,
    viewRef,
  };
}
