/**
 * /code — CodeMirror-based code editor
 *
 * Sub-issue #20: Foundation — CM6 editor, eager/lazy languages, auto-theme, status bar
 * Sub-issue #21: Settings — storage, context, drawer UI, all fields wired to compartments
 */
import { useEffect, useRef, useState, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { useEditor } from "~/lib/code-editor/use-editor";
import { StatusBar } from "~/lib/code-editor/status-bar";
import { SettingsProvider, useCodeSettings } from "~/lib/code-editor/settings-context";
import { SettingsDrawer } from "~/lib/code-editor/settings-drawer";
import { langFromFilename, langById } from "~/lib/code-editor/languages";
import { LANG_STORAGE_KEY } from "~/lib/code-editor/lang-storage";

const DRAFT_KEY = "office:code:draft";

// ── Inner component (needs settings context) ──────────────────────────────────
function CodeEditor() {
  const { settings, update } = useCodeSettings();
  const [value, setValue] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFocus, setDrawerFocus] = useState<string | undefined>();

  const { extensions, statusStore, activeLang, setLanguage, applySettings, onCreateEditor } =
    useEditor(settings);

  // ── Load draft + restore language ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY) ?? "";
    setValue(saved);

    if (settings.files.restoreLanguage) {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
      if (savedLang && langById.has(savedLang)) {
        setLanguage(savedLang);
      }
    }

    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── Autosave ───────────────────────────────────────────────────────────────
  const valueRef = useRef(value);
  valueRef.current = value;
  const autosaveMsRef = useRef(settings.files.autosaveMs);
  autosaveMsRef.current = settings.files.autosaveMs;

  useEffect(() => {
    if (autosaveMsRef.current === 0) return;
    const t = setInterval(() => {
      if (autosaveMsRef.current > 0) {
        localStorage.setItem(DRAFT_KEY, valueRef.current);
      }
    }, autosaveMsRef.current || 1000);
    return () => clearInterval(t);
  }, [settings.files.autosaveMs]);

  // ── Sync settings → CM compartments ───────────────────────────────────────
  const prevSettingsRef = useRef(settings);
  useEffect(() => {
    applySettings(settings, prevSettingsRef.current);
    prevSettingsRef.current = settings;
  }, [settings, applySettings]);

  // ── Language change — also persist to localStorage ─────────────────────────
  const handleLanguageChange = useCallback(
    (id: string) => {
      setLanguage(id);
      localStorage.setItem(LANG_STORAGE_KEY, id);
    },
    [setLanguage],
  );

  // ── Keyboard shortcut Ctrl-, to open settings ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setDrawerOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Status bar indent/EOL click → open settings at the right section ───────
  const openAtIndent = useCallback(() => {
    setDrawerFocus("files.indent");
    setDrawerOpen(true);
  }, []);

  const openAtEol = useCallback(() => {
    setDrawerFocus("files.eol");
    setDrawerOpen(true);
  }, []);

  // ── Font family CSS value ──────────────────────────────────────────────────
  const fontFamilyStyle = (() => {
    switch (settings.display.fontFamily) {
      case "jetbrains-mono": return '"JetBrains Mono", monospace';
      case "fira-code": return '"Fira Code", monospace';
      default: return "var(--font-mono)";
    }
  })();

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <section className="flex flex-col gap-2" style={{ height: "calc(100vh - 9rem)" }}>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="m-0 text-xl font-semibold tracking-tight">Code editor</h1>
        </header>
        <div className="flex-1 animate-pulse rounded-xl border border-border bg-card" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2" style={{ height: "calc(100vh - 9rem)" }}>
      {/* Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Code editor</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Settings (Ctrl-,)"
            aria-label="Open settings"
            className="rounded p-1.5 text-muted hover:bg-border hover:text-fg transition-colors"
          >
            {/* Gear icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <CodeMirror
          value={value}
          onChange={setValue}
          extensions={extensions}
          onCreateEditor={onCreateEditor}
          basicSetup={{
            // These are managed by compartments — disable from basicSetup
            lineNumbers: false,
            highlightActiveLine: false,
            // Keep everything else from basicSetup
            foldGutter: true,
            highlightSelectionMatches: true,
            closeBrackets: settings.editor.brackets,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            searchKeymap: true,
            tabSize: settings.files.tabWidth,
          }}
          style={{
            height: "100%",
            fontSize: `${settings.display.fontSize}px`,
            lineHeight: settings.display.lineHeight,
            fontFamily: fontFamilyStyle,
          }}
          height="100%"
          placeholder="Start typing…"
        />
      </div>

      {/* Status bar */}
      <StatusBar
        store={statusStore}
        activeLang={activeLang}
        onLanguageChange={handleLanguageChange}
        indent={settings.files.indent === "tabs" ? "Tabs" : `Spaces: ${settings.files.tabWidth}`}
        eol={settings.files.eol === "auto" ? "Auto" : settings.files.eol.toUpperCase()}
        onIndentClick={openAtIndent}
        onEolClick={openAtEol}
        className="px-1 py-0.5 text-xs text-muted"
      />

      {/* Settings drawer */}
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerFocus(undefined); }}
        initialFocus={drawerFocus}
      />
    </section>
  );
}

// ── Route export (wraps with SettingsProvider) ────────────────────────────────
export default function Code() {
  return (
    <SettingsProvider>
      <CodeEditor />
    </SettingsProvider>
  );
}
