/**
 * Lowlight instance for the document editor's code blocks.
 *
 * Eager languages (bundled in the initial doc-route chunk, as they're the
 * most commonly needed — safe to keep eager since /doc is itself already a
 * lazy-loaded route chunk):
 *   javascript, typescript, json, markdown, xml (html), css, python, sql
 *
 * Lazy languages (separate Bun.build hashed chunks, loaded on first use):
 *   Everything else in highlight.js — loaded via loadLanguage(name).
 *
 * Pattern mirrors app/lib/code-editor/languages.ts: each entry is a thunk
 * `() => Promise<void>` so the registry has a uniform interface.
 */
import { createLowlight } from "lowlight";

// Eager imports — all in the doc route chunk (already lazy-split from root)
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import xml from "highlight.js/lib/languages/xml"; // covers HTML
import css from "highlight.js/lib/languages/css";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";

export const lowlight = createLowlight();

// Register eager languages immediately
lowlight.register("javascript", javascript);
lowlight.register("js", javascript);
lowlight.register("typescript", typescript);
lowlight.register("ts", typescript);
lowlight.register("json", json);
lowlight.register("markdown", markdown);
lowlight.register("md", markdown);
lowlight.register("xml", xml);
lowlight.register("html", xml);
lowlight.register("css", css);
lowlight.register("python", python);
lowlight.register("py", python);
lowlight.register("sql", sql);

// ── Lazy language registry ────────────────────────────────────────────────────
// Each value is a thunk that dynamically imports the language and registers it.
// Bun.build sees these as dynamic imports and emits them as separate chunks.

type LangLoader = () => Promise<void>;

const lazyLangs: Record<string, LangLoader> = {
  bash: () =>
    import("highlight.js/lib/languages/bash").then((m) =>
      lowlight.register("bash", m.default),
    ),
  sh: () =>
    import("highlight.js/lib/languages/bash").then((m) =>
      lowlight.register("sh", m.default),
    ),
  c: () =>
    import("highlight.js/lib/languages/c").then((m) =>
      lowlight.register("c", m.default),
    ),
  cpp: () =>
    import("highlight.js/lib/languages/cpp").then((m) =>
      lowlight.register("cpp", m.default),
    ),
  csharp: () =>
    import("highlight.js/lib/languages/csharp").then((m) =>
      lowlight.register("csharp", m.default),
    ),
  cs: () =>
    import("highlight.js/lib/languages/csharp").then((m) =>
      lowlight.register("cs", m.default),
    ),
  go: () =>
    import("highlight.js/lib/languages/go").then((m) =>
      lowlight.register("go", m.default),
    ),
  java: () =>
    import("highlight.js/lib/languages/java").then((m) =>
      lowlight.register("java", m.default),
    ),
  kotlin: () =>
    import("highlight.js/lib/languages/kotlin").then((m) =>
      lowlight.register("kotlin", m.default),
    ),
  rust: () =>
    import("highlight.js/lib/languages/rust").then((m) =>
      lowlight.register("rust", m.default),
    ),
  ruby: () =>
    import("highlight.js/lib/languages/ruby").then((m) =>
      lowlight.register("ruby", m.default),
    ),
  rb: () =>
    import("highlight.js/lib/languages/ruby").then((m) =>
      lowlight.register("rb", m.default),
    ),
  php: () =>
    import("highlight.js/lib/languages/php").then((m) =>
      lowlight.register("php", m.default),
    ),
  swift: () =>
    import("highlight.js/lib/languages/swift").then((m) =>
      lowlight.register("swift", m.default),
    ),
  yaml: () =>
    import("highlight.js/lib/languages/yaml").then((m) =>
      lowlight.register("yaml", m.default),
    ),
  yml: () =>
    import("highlight.js/lib/languages/yaml").then((m) =>
      lowlight.register("yml", m.default),
    ),
  toml: () =>
    import("highlight.js/lib/languages/ini").then((m) =>
      lowlight.register("toml", m.default),
    ),
  ini: () =>
    import("highlight.js/lib/languages/ini").then((m) =>
      lowlight.register("ini", m.default),
    ),
  dockerfile: () =>
    import("highlight.js/lib/languages/dockerfile").then((m) =>
      lowlight.register("dockerfile", m.default),
    ),
  graphql: () =>
    import("highlight.js/lib/languages/graphql").then((m) =>
      lowlight.register("graphql", m.default),
    ),
  scala: () =>
    import("highlight.js/lib/languages/scala").then((m) =>
      lowlight.register("scala", m.default),
    ),
  r: () =>
    import("highlight.js/lib/languages/r").then((m) =>
      lowlight.register("r", m.default),
    ),
  lua: () =>
    import("highlight.js/lib/languages/lua").then((m) =>
      lowlight.register("lua", m.default),
    ),
  perl: () =>
    import("highlight.js/lib/languages/perl").then((m) =>
      lowlight.register("perl", m.default),
    ),
  haskell: () =>
    import("highlight.js/lib/languages/haskell").then((m) =>
      lowlight.register("haskell", m.default),
    ),
};

/** Tracks in-flight or completed loads so we don't double-import. */
const loaded = new Set<string>();

/**
 * Ensure a language pack is registered.
 * Returns true if the language is available (eager or now loaded).
 * Returns false if the language is unknown to this registry.
 */
export async function loadLanguage(name: string): Promise<boolean> {
  // Already registered (eager or previously loaded)
  if (lowlight.registered(name)) return true;

  const loader = lazyLangs[name.toLowerCase()];
  if (!loader) return false;

  // Deduplicate concurrent calls
  if (!loaded.has(name)) {
    loaded.add(name);
    await loader();
  }

  return true;
}

/**
 * All language names this registry knows about (eager + lazy).
 */
export const KNOWN_LANGUAGES: string[] = [
  "javascript", "js",
  "typescript", "ts",
  "json",
  "markdown", "md",
  "html", "xml",
  "css",
  "python", "py",
  "sql",
  ...Object.keys(lazyLangs),
];
