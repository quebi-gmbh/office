/**
 * Maps a filename to the tool that should open it.
 *
 * `primary` is the default tool; `alternatives` lists other tools that can also
 * handle the file (shown as an override menu for ambiguous types like .json or
 * .html). A file with no known mapping returns `primary: null`.
 */

export type ToolId = "code" | "docs" | "paint" | "table";

export const TOOL_PATH: Record<ToolId, string> = {
  code: "/code",
  docs: "/docs",
  paint: "/paint",
  table: "/table",
};

export const TOOL_LABEL: Record<ToolId, string> = {
  code: "Code",
  docs: "Doc",
  paint: "Paint",
  table: "Table",
};

// Primary tool per extension. Ambiguous extensions get extra entries in
// ALTERNATIVES below.
const PRIMARY: Record<string, ToolId> = {
  // ── Docs ──
  md: "docs",
  markdown: "docs",
  mdown: "docs",
  docx: "docs",
  rtf: "docs",
  // ── Paint / images ──
  png: "paint",
  jpg: "paint",
  jpeg: "paint",
  gif: "paint",
  webp: "paint",
  bmp: "paint",
  ico: "paint",
  // ── Table / data ──
  csv: "table",
  tsv: "table",
  xlsx: "table",
  xls: "table",
  jsonl: "table",
  ndjson: "table",
  // ── Code / text ──
  txt: "code",
  json: "code",
  html: "docs",
  htm: "docs",
};

// Extra tools that can also open a given extension, in priority order after the
// primary. Drives the "open with…" override menu.
const ALTERNATIVES: Record<string, ToolId[]> = {
  json: ["table"],
  jsonl: ["code"],
  html: ["code", "table"],
  htm: ["code"],
  txt: ["docs"],
  csv: ["code"],
  tsv: ["code"],
  md: ["code"],
  markdown: ["code"],
};

// Extensions handled by the code editor even though they're not listed above.
// Anything with a "texty" extension falls through to code.
const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "kt", "swift", "c", "h", "cpp", "cc", "hpp", "cs", "php", "pl", "lua",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "gitignore",
  "dockerfile", "makefile", "vue", "svelte", "astro", "graphql", "gql",
  "proto", "diff", "patch", "log", "tex", "r", "jl", "dart", "scala", "clj",
  "ex", "exs", "elm", "hs", "ml", "nim", "zig", "vim", "asm", "s",
]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export interface ToolResolution {
  primary: ToolId | null;
  alternatives: ToolId[];
}

/** Resolve which tool(s) can open a file. */
export function resolveTool(name: string): ToolResolution {
  const ext = extensionOf(name);
  let primary: ToolId | null = PRIMARY[ext] ?? null;
  if (!primary && CODE_EXTENSIONS.has(ext)) primary = "code";

  const alternatives = (ALTERNATIVES[ext] ?? []).filter((t) => t !== primary);
  return { primary, alternatives };
}

/** True if any tool can open the file. */
export function isOpenable(name: string): boolean {
  return resolveTool(name).primary !== null;
}

/** All tools that can open the file, primary first. */
export function toolsFor(name: string): ToolId[] {
  const { primary, alternatives } = resolveTool(name);
  return primary ? [primary, ...alternatives] : [];
}
