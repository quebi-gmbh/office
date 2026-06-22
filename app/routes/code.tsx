/**
 * /code — CodeMirror-based code editor
 *
 * Sub-issues #20–#24 — Foundation, Settings, Import & Export,
 * Power features, Formatting & language tools
 */
import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { useEditor } from "~/lib/code-editor/use-editor";
import { StatusBar } from "~/lib/code-editor/status-bar";
import { SettingsProvider, useCodeSettings } from "~/lib/code-editor/settings-context";
import { SettingsDrawer } from "~/lib/code-editor/settings-drawer";
import { FileMenu } from "~/lib/code-editor/file-menu";
import type { FileMenuAction } from "~/lib/code-editor/file-menu";
import { UrlModal } from "~/lib/code-editor/url-modal";
import { CommandPalette } from "~/components/CommandPalette";
import { MarkdownPreview } from "~/lib/code-editor/markdown-preview";
import { formatDoc, canFormat } from "~/lib/code-editor/prettier";
import { prettyJson, minifyJson } from "~/lib/code-editor/json-tools";
import { useToast } from "~/components/Toast";
import {
  openFile,
  applyExportTransforms,
  saveToHandle,
  downloadFile,
  defaultFilename,
  copyText,
  copyAsMarkdown,
  copyAsHtml,
  shareUrl,
  decodeShareHash,
  printDoc,
  exportPng,
} from "~/lib/code-editor/io";
import type { FileState } from "~/lib/code-editor/io";
import { langById, noLanguage } from "~/lib/code-editor/languages";
import type { Lang } from "~/lib/code-editor/languages";
import { LANG_STORAGE_KEY } from "~/lib/code-editor/lang-storage";
import { takeCodeHandoff } from "~/lib/code-handoff";

const DRAFT_KEY = "office:code:draft";

// ── Inner component ───────────────────────────────────────────────────────────
function CodeEditor() {
  const { settings, update } = useCodeSettings();
  const [value, setValue] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFocus, setDrawerFocus] = useState<string | undefined>();
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileState, setFileState] = useState<FileState>({
    name: null,
    handle: null,
    dirty: false,
  });
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const ctrlKPendingRef = useRef(false);
  const { show: showToast, ToastContainer } = useToast();

  const { extensions, statusStore, activeLang, setLanguage, applySettings, onCreateEditor, viewRef } =
    useEditor(settings);

  // ── Load draft + hash share + restore language ────────────────────────────
  useEffect(() => {
    // Handoff from another tool (e.g. /table "Open in /code") takes priority.
    const handoff = takeCodeHandoff();
    if (handoff) {
      setValue(handoff.text);
      if (langById.has(handoff.langId)) setLanguage(handoff.langId);
      setFileState((s) => ({ ...s, dirty: true }));
      setLoaded(true);
      return;
    }
    // Check for a shared URL hash first
    const hash = location.hash;
    if (hash) {
      decodeShareHash(hash).then((result) => {
        if (result) {
          setValue(result.text);
          const lang = langById.get(result.langId) ?? noLanguage;
          setLanguage(result.langId);
          setFileState((s) => ({ ...s, dirty: false }));
          showToast(`Loaded shared ${lang.label} document`);
          // Clear the hash so it doesn't reload on next refresh
          history.replaceState(null, "", location.pathname);
        }
        setLoaded(true);
      });
      return;
    }

    const saved = localStorage.getItem(DRAFT_KEY) ?? "";
    setValue(saved);

    if (settings.files.restoreLanguage) {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
      if (savedLang && langById.has(savedLang)) setLanguage(savedLang);
    }
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave ───────────────────────────────────────────────────────────────
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (settings.files.autosaveMs === 0) return;
    const t = setInterval(() => {
      localStorage.setItem(DRAFT_KEY, valueRef.current);
    }, settings.files.autosaveMs);
    return () => clearInterval(t);
  }, [settings.files.autosaveMs]);

  // ── Settings sync ──────────────────────────────────────────────────────────
  const prevSettingsRef = useRef(settings);
  useEffect(() => {
    applySettings(settings, prevSettingsRef.current);
    prevSettingsRef.current = settings;
  }, [settings, applySettings]);

  // ── Mark buffer dirty on edits ─────────────────────────────────────────────
  const handleChange = useCallback(
    (v: string) => {
      setValue(v);
      if (v !== value) setFileState((s) => ({ ...s, dirty: true }));
    },
    [value],
  );

  // ── Language helpers ───────────────────────────────────────────────────────
  const handleLanguageChange = useCallback(
    (id: string) => {
      setLanguage(id);
      localStorage.setItem(LANG_STORAGE_KEY, id);
    },
    [setLanguage],
  );

  const openDocument = useCallback(
    (text: string, lang: Lang, name: string, handle?: FileSystemFileHandle) => {
      setValue(text);
      setLanguage(lang.id);
      localStorage.setItem(LANG_STORAGE_KEY, lang.id);
      setFileState({ name, handle: handle ?? null, dirty: false });
    },
    [setLanguage],
  );

  // ── I/O action dispatcher ─────────────────────────────────────────────────
  const handleFileAction = useCallback(
    async (action: FileMenuAction) => {
      switch (action) {
        case "open": {
          if (fileState.dirty && !confirm("Discard current changes?")) break;
          const result = await openFile();
          if (result) openDocument(result.text, result.lang, result.name, result.handle);
          break;
        }
        case "open-url": {
          if (fileState.dirty && !confirm("Discard current changes?")) break;
          setUrlModalOpen(true);
          break;
        }
        case "download": {
          const text = applyExportTransforms(value, settings, activeLang);
          const name = fileState.name ?? defaultFilename(activeLang);
          downloadFile(text, name);
          setFileState((s) => ({ ...s, dirty: false }));
          break;
        }
        case "save": {
          // Format on save when enabled
          if (settings.format.onSave) {
            const view = viewRef.current;
            if (view) {
              try { await formatDoc(view, activeLang.id, settings); } catch { /* ignore */ }
            }
          }
          const text = applyExportTransforms(value, settings, activeLang);
          if (fileState.handle) {
            await saveToHandle(text, fileState.handle);
            setFileState((s) => ({ ...s, dirty: false }));
            showToast("Saved");
          } else {
            const name = fileState.name ?? defaultFilename(activeLang);
            downloadFile(text, name);
            setFileState((s) => ({ ...s, dirty: false }));
          }
          break;
        }
        case "share": {
          const { url, oversized } = await shareUrl(value, activeLang.id);
          await navigator.clipboard.writeText(url);
          showToast(oversized ? "URL copied (large payload — may not work in all browsers)" : "URL copied to clipboard");
          break;
        }
        case "print":
          printDoc();
          break;
        case "export-png": {
          const el = editorContainerRef.current;
          if (!el) break;
          try {
            await exportPng(el);
          } catch (e) {
            showToast("PNG export failed", "error");
            console.error(e);
          }
          break;
        }
      }
    },
    [value, settings, activeLang, fileState, openDocument, showToast],
  );

  // ── Format handler ────────────────────────────────────────────────────────
  const handleFormat = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    try {
      const formatted = await formatDoc(view, activeLang.id, settings);
      if (!formatted) showToast(`No formatter for ${activeLang.label}`, "error");
    } catch (e) {
      showToast(`Format error: ${(e as Error).message}`, "error");
    }
  }, [viewRef, activeLang, settings, showToast]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === ",") { e.preventDefault(); setDrawerOpen(true); return; }
      if (mod && e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); setPaletteOpen(true); return; }
      if (mod && e.key === "o") { e.preventDefault(); handleFileAction("open"); return; }
      if (mod && e.key === "s") { e.preventDefault(); handleFileAction("save"); return; }
      if (mod && e.shiftKey && e.key === "C") { e.preventDefault(); copyText(editorContainerRef.current as unknown as import("@codemirror/view").EditorView); return; }
      // Shift-Alt-F → format document
      if (e.shiftKey && e.altKey && e.key === "F") { e.preventDefault(); handleFormat(); return; }
      // Ctrl-K V → toggle Markdown preview (Ctrl-K is a prefix chord)
      if (mod && e.key === "k") {
        e.preventDefault();
        ctrlKPendingRef.current = true;
        setTimeout(() => { ctrlKPendingRef.current = false; }, 1500);
        return;
      }
      if (ctrlKPendingRef.current && e.key === "v") {
        e.preventDefault();
        ctrlKPendingRef.current = false;
        if (activeLang.id === "markdown") setPreviewOpen((o) => !o);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleFileAction, handleFormat, activeLang.id]);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (fileState.dirty && !confirm("Discard current changes?")) return;
    const text = await file.text();
    const { langFromFilename } = await import("~/lib/code-editor/languages");
    openDocument(text, langFromFilename(file.name), file.name);
  };

  // ── Settings drawer anchors ───────────────────────────────────────────────
  const openAtIndent = useCallback(() => { setDrawerFocus("files.indent"); setDrawerOpen(true); }, []);
  const openAtEol = useCallback(() => { setDrawerFocus("files.eol"); setDrawerOpen(true); }, []);

  // ── Font styling ──────────────────────────────────────────────────────────
  const fontFamilyStyle = (() => {
    switch (settings.display.fontFamily) {
      case "jetbrains-mono": return '"JetBrains Mono", monospace';
      case "fira-code": return '"Fira Code", monospace';
      default: return "var(--font-mono)";
    }
  })();

  const indentLabel =
    settings.files.indent === "tabs"
      ? "Tabs"
      : `Spaces: ${settings.files.tabWidth}`;
  const eolLabel =
    settings.files.eol === "auto" ? "Auto" : settings.files.eol.toUpperCase();

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
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-xl font-semibold tracking-tight">Code editor</h1>
          {fileState.name && (
            <span className="text-sm text-muted">
              {fileState.name}{fileState.dirty ? " ●" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* JSON tools — shown only when active language is JSON */}
          {activeLang.id === "json" && (
            <>
              <button
                type="button"
                title="Pretty-print JSON"
                onClick={() => {
                  const view = viewRef.current;
                  if (view) {
                    const err = prettyJson(view);
                    if (err) showToast(`JSON error: ${err}`, "error");
                  }
                }}
                className="rounded px-2 py-1 text-xs text-muted hover:bg-border hover:text-fg transition-colors"
              >
                Pretty
              </button>
              <button
                type="button"
                title="Minify JSON"
                onClick={() => {
                  const view = viewRef.current;
                  if (view) {
                    const err = minifyJson(view);
                    if (err) showToast(`JSON error: ${err}`, "error");
                  }
                }}
                className="rounded px-2 py-1 text-xs text-muted hover:bg-border hover:text-fg transition-colors"
              >
                Minify
              </button>
            </>
          )}

          {/* Format button — shown when Prettier supports active language */}
          {canFormat(activeLang.id) && (
            <button
              type="button"
              title="Format document (Shift-Alt-F)"
              onClick={handleFormat}
              className="rounded px-2 py-1 text-xs text-muted hover:bg-border hover:text-fg transition-colors"
            >
              Format
            </button>
          )}

          {/* Markdown preview toggle */}
          {activeLang.id === "markdown" && (
            <button
              type="button"
              title="Toggle Markdown preview (Ctrl-K V)"
              onClick={() => setPreviewOpen((o) => !o)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                previewOpen
                  ? "bg-accent text-white"
                  : "text-muted hover:bg-border hover:text-fg"
              }`}
            >
              Preview
            </button>
          )}

          <FileMenu onAction={handleFileAction} />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Settings (Ctrl-,)"
            aria-label="Open settings"
            className="rounded p-1.5 text-muted hover:bg-border hover:text-fg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Editor + optional Markdown preview split-pane */}
      <div className="min-h-0 flex-1 flex gap-2 overflow-hidden">
      {/* Editor with drag-and-drop */}
      <div
        ref={editorContainerRef}
        className={`${previewOpen ? "w-1/2" : "flex-1"} overflow-hidden rounded-xl border transition-colors ${
          isDragging ? "border-accent bg-card/50" : "border-border"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-accent text-sm">
            Drop file to open
          </div>
        )}
        <CodeMirror
          value={value}
          onChange={handleChange}
          extensions={extensions}
          onCreateEditor={onCreateEditor}
          basicSetup={{
            lineNumbers: false,
            highlightActiveLine: false,
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

      {/* Markdown preview pane */}
      {previewOpen && activeLang.id === "markdown" && (
        <div className="w-1/2 overflow-hidden rounded-xl border border-border bg-card">
          <MarkdownPreview source={value} className="h-full" />
        </div>
      )}
      </div>{/* end editor+preview flex wrapper */}

      {/* Status bar */}
      <StatusBar
        store={statusStore}
        activeLang={activeLang}
        onLanguageChange={handleLanguageChange}
        indent={indentLabel}
        eol={eolLabel}
        onIndentClick={openAtIndent}
        onEolClick={openAtEol}
        keymap={settings.keymap}
        className="px-1 py-0.5 text-xs text-muted"
      />

      {/* Overlays */}
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerFocus(undefined); }}
        initialFocus={drawerFocus}
      />
      <UrlModal
        open={urlModalOpen}
        onClose={() => setUrlModalOpen(false)}
        onLoad={(text, lang, name) => openDocument(text, lang, name)}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        ctx={{
          fileAction: handleFileAction,
          setLanguage: handleLanguageChange,
          openSettings: (focus) => {
            setDrawerFocus(focus);
            setDrawerOpen(true);
          },
          copyMarkdown: () => {
            const view = viewRef.current;
            if (view) copyAsMarkdown(view, activeLang).catch(console.error);
          },
          copyHtml: () => {
            const view = viewRef.current;
            if (view) copyAsHtml(view).catch(console.error);
          },
        }}
      />
      <ToastContainer />
    </section>
  );
}

// ── Route export ──────────────────────────────────────────────────────────────
export default function Code() {
  return (
    <SettingsProvider>
      <CodeEditor />
    </SettingsProvider>
  );
}
