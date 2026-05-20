/**
 * Language registry for the code editor.
 *
 * "Eager" languages are statically imported and included in the initial bundle.
 * "Lazy" languages are behind `() => import(...)` — Bun.build emits them as
 * separate hashed chunks and they are only fetched when first selected.
 */
import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

// ── Eager imports ────────────────────────────────────────────────────────────
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";

export type Lang = {
  id: string;
  label: string;
  group: "Common" | "More";
  /** File extensions (without leading dot) used to auto-detect language. */
  extensions: string[];
  /** Returns the CM Extension to mount in the language compartment. */
  load: () => Promise<Extension>;
};

export const noLanguage: Lang = {
  id: "plaintext",
  label: "Plain Text",
  group: "Common",
  extensions: ["txt"],
  load: () => Promise.resolve([]),
};

// ── Registry ─────────────────────────────────────────────────────────────────
export const languages: Lang[] = [
  // Common (eager)
  {
    id: "javascript",
    label: "JavaScript / TypeScript",
    group: "Common",
    extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"],
    load: () => Promise.resolve(javascript({ typescript: true, jsx: true })),
  },
  {
    id: "json",
    label: "JSON",
    group: "Common",
    extensions: ["json", "jsonc", "json5"],
    load: () => Promise.resolve(json()),
  },
  {
    id: "markdown",
    label: "Markdown",
    group: "Common",
    extensions: ["md", "mdx", "markdown"],
    load: () => Promise.resolve(markdown()),
  },
  {
    id: "html",
    label: "HTML",
    group: "Common",
    extensions: ["html", "htm", "xhtml"],
    load: () => Promise.resolve(html()),
  },
  {
    id: "css",
    label: "CSS / SCSS / Less",
    group: "Common",
    extensions: ["css", "scss", "less"],
    load: () => Promise.resolve(css()),
  },
  {
    id: "python",
    label: "Python",
    group: "Common",
    extensions: ["py", "pyw", "pyi"],
    load: () => Promise.resolve(python()),
  },
  {
    id: "sql",
    label: "SQL",
    group: "Common",
    extensions: ["sql"],
    load: () => Promise.resolve(sql()),
  },
  noLanguage,

  // More (lazy)
  {
    id: "cpp",
    label: "C / C++",
    group: "More",
    extensions: ["c", "h", "cpp", "cc", "cxx", "hpp", "hxx"],
    load: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  },
  {
    id: "java",
    label: "Java",
    group: "More",
    extensions: ["java"],
    load: () => import("@codemirror/lang-java").then((m) => m.java()),
  },
  {
    id: "rust",
    label: "Rust",
    group: "More",
    extensions: ["rs"],
    load: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  },
  {
    id: "go",
    label: "Go",
    group: "More",
    extensions: ["go"],
    load: () => import("@codemirror/lang-go").then((m) => m.go()),
  },
  {
    id: "php",
    label: "PHP",
    group: "More",
    extensions: ["php", "php3", "php4", "php5"],
    load: () => import("@codemirror/lang-php").then((m) => m.php()),
  },
  {
    id: "xml",
    label: "XML",
    group: "More",
    extensions: ["xml", "svg", "rss", "atom"],
    load: () => import("@codemirror/lang-xml").then((m) => m.xml()),
  },
  {
    id: "shell",
    label: "Shell",
    group: "More",
    extensions: ["sh", "bash", "zsh", "fish"],
    load: () =>
      import("@codemirror/legacy-modes/mode/shell").then(({ shell }) =>
        StreamLanguage.define(shell),
      ),
  },
  {
    id: "dockerfile",
    label: "Dockerfile",
    group: "More",
    extensions: ["dockerfile"],
    load: () =>
      import("@codemirror/legacy-modes/mode/dockerfile").then(
        ({ dockerFile }) => StreamLanguage.define(dockerFile),
      ),
  },
  {
    id: "toml",
    label: "TOML",
    group: "More",
    extensions: ["toml"],
    load: () =>
      import("@codemirror/legacy-modes/mode/toml").then(({ toml }) =>
        StreamLanguage.define(toml),
      ),
  },
  {
    id: "yaml",
    label: "YAML",
    group: "More",
    extensions: ["yaml", "yml"],
    load: () =>
      import("@codemirror/legacy-modes/mode/yaml").then(({ yaml }) =>
        StreamLanguage.define(yaml),
      ),
  },
  {
    id: "lua",
    label: "Lua",
    group: "More",
    extensions: ["lua"],
    load: () =>
      import("@codemirror/legacy-modes/mode/lua").then(({ lua }) =>
        StreamLanguage.define(lua),
      ),
  },
  {
    id: "ruby",
    label: "Ruby",
    group: "More",
    extensions: ["rb", "rake", "gemspec"],
    load: () =>
      import("@codemirror/legacy-modes/mode/ruby").then(({ ruby }) =>
        StreamLanguage.define(ruby),
      ),
  },
];

// ── Lookups ──────────────────────────────────────────────────────────────────

export const langById = new Map<string, Lang>(languages.map((l) => [l.id, l]));

/** Map from file extension (without dot) → Lang. */
export const langByExtension = new Map<string, Lang>(
  languages.flatMap((l) => l.extensions.map((ext) => [ext, l] as [string, Lang])),
);

/** Return a Lang for a filename, or noLanguage if unrecognised. */
export function langFromFilename(name: string): Lang {
  const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
  return langByExtension.get(ext) ?? noLanguage;
}
