/**
 * /code — CodeMirror-based code editor
 *
 * Sub-issue #20: Foundation
 * - CM6 editor with basicSetup (line numbers, history, search, bracket matching,
 *   autocomplete, folding, default keymap)
 * - Tab key inserts indent
 * - Eager language pack (JS/TS, JSON, Markdown, HTML, CSS, Python, SQL)
 * - Lazy-loaded long-tail languages (C/C++, Java, Rust, Go, PHP, XML, Shell, …)
 * - Auto theme (light / dark) following prefers-color-scheme
 * - Status bar: cursor position, selection size, doc stats, language picker,
 *   indent indicator, EOL indicator, encoding
 * - Autosave to localStorage (office:code:draft)
 */
import { useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { useEditor } from "~/lib/code-editor/use-editor";
import { StatusBar } from "~/lib/code-editor/status-bar";

const STORAGE_KEY = "office:code:draft";
const AUTOSAVE_MS = 1000;

export default function Code() {
  const [value, setValue] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  // Load draft from localStorage on first mount only
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    setValue(saved);
    setLoaded(true);
  }, []);

  // Autosave — use a ref to the latest value so the effect only runs once
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const t = setInterval(() => {
      localStorage.setItem(STORAGE_KEY, valueRef.current);
    }, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, []);

  const { extensions, statusStore, activeLang, setLanguage, onCreateEditor } =
    useEditor();

  // Don't render the editor until localStorage has been read to avoid
  // a flash where the editor briefly shows the empty default value
  if (!loaded) {
    return (
      <section className="flex flex-col gap-2 h-[calc(100vh-9rem)]">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight m-0">Code editor</h1>
        </header>
        <div className="flex-1 rounded-xl border border-border bg-card animate-pulse" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 h-[calc(100vh-9rem)]">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight m-0">Code editor</h1>
      </header>

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <CodeMirror
          value={value}
          onChange={setValue}
          extensions={extensions}
          onCreateEditor={onCreateEditor}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            searchKeymap: true,
            tabSize: 2,
          }}
          style={{ height: "100%", fontSize: "14px" }}
          height="100%"
          placeholder="Start typing…"
        />
      </div>

      {/* Status bar */}
      <StatusBar
        store={statusStore}
        activeLang={activeLang}
        onLanguageChange={setLanguage}
        className="px-1 py-0.5 text-xs text-muted"
      />
    </section>
  );
}
