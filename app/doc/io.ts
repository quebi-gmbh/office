/**
 * Document I/O — import, export, copy, share, print.
 *
 * All heavy dependencies (marked, turndown, dompurify) are lazy-loaded via
 * dynamic import so they stay out of the initial bundle. They are only
 * loaded when the user actually triggers the relevant action.
 *
 * Mirrors app/lib/code-editor/io.ts in structure and patterns.
 */
import type { Editor } from "@tiptap/react";
import type { DocSettings } from "./settings";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpenResult = {
  name: string;
  text: string;
  /** File System Access API handle — present when FSA is available. */
  handle?: FileSystemFileHandle;
};

export type ShareResult = {
  url: string;
  oversized: boolean;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Derive a safe filename from the document title. */
export function filenameFromTitle(title: string, ext: string): string {
  const base = title.trim() || "document";
  const safe = base.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-");
  return `${safe}.${ext}`;
}

/** Download a text file to the user's device. */
export function downloadFile(
  text: string,
  filename: string,
  mime = "text/plain",
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Open ──────────────────────────────────────────────────────────────────────

/**
 * Open a .md or .html file from disk.
 * Uses File System Access API where available; falls back to <input type=file>.
 */
export async function openDocument(): Promise<OpenResult | null> {
  if (
    typeof window !== "undefined" &&
    "showOpenFilePicker" in window
  ) {
    try {
      const [handle] = await (
        window as Window & {
          showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        types: [
          {
            description: "Document files",
            accept: {
              "text/markdown": [".md"],
              "text/html": [".html", ".htm"],
              "text/plain": [".txt"],
            },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      return { name: file.name, text, handle };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // FSA failed — fall through to input fallback
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.html,.htm,.txt";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ name: file.name, text: reader.result as string });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Open a Markdown file from disk (`.md` / `.markdown` / `.txt`).
 * Mirrors openDocument but scopes the picker to Markdown.
 */
export async function openMarkdownFile(): Promise<OpenResult | null> {
  if (typeof window !== "undefined" && "showOpenFilePicker" in window) {
    try {
      const [handle] = await (
        window as Window & {
          showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        types: [
          {
            description: "Markdown files",
            accept: { "text/markdown": [".md", ".markdown"], "text/plain": [".txt"] },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // FSA failed — fall through to input fallback
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: reader.result as string });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Convert Markdown text to sanitized HTML. Both `marked` and `dompurify` are
 * lazy-loaded so they stay out of the initial bundle.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    import("marked"),
    import("dompurify"),
  ]);
  const rawHtml = await marked(markdown);
  return DOMPurify.sanitize(rawHtml);
}

/**
 * Convert Markdown text to sanitized HTML, then load it into the editor,
 * replacing the current document.
 */
export async function importMarkdown(
  editor: Editor,
  markdown: string,
): Promise<void> {
  editor.commands.setContent(await markdownToHtml(markdown));
}

/**
 * Convert Markdown and insert it at the given position (or the current
 * selection when no position is given) without replacing the document.
 * Used by drag-drop of `.md` files / text and by markdown-aware paste.
 */
export async function insertMarkdown(
  editor: Editor,
  markdown: string,
  pos?: number,
): Promise<void> {
  const html = await markdownToHtml(markdown);
  if (pos == null) {
    editor.chain().focus().insertContent(html).run();
  } else {
    editor.chain().focus().insertContentAt(pos, html).run();
  }
}

/**
 * Heuristic: does this text look like Markdown worth importing?
 *
 * Pure and side-effect free so it can be unit-tested and used in hot paste/drop
 * paths. Conservative on purpose — plain prose should fall through to the host's
 * default paste behaviour. Returns true when at least one reasonably strong
 * Markdown signal is present.
 */
export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Strong, unambiguous block-level signals — any single one is enough.
  const strong: RegExp[] = [
    /^#{1,6}\s+\S/m, // ATX heading: "# Title"
    /^```|^~~~/m, // fenced code block
    /^\s{0,3}>\s+\S/m, // blockquote
    /^\s*\|.+\|\s*$\n^\s*\|?[\s:|-]+\|?\s*$/m, // pipe table with separator row
    /^[^\n]+\n[=-]{3,}\s*$/m, // setext heading underline
    /!\[[^\]]*\]\([^)]+\)/, // image
    /^\s*[-*+]\s+\S.*\n\s*[-*+]\s+\S/m, // ≥2 consecutive unordered list items
    /^\s*\d+\.\s+\S.*\n\s*\d+\.\s+\S/m, // ≥2 consecutive ordered list items
  ];
  if (strong.some((re) => re.test(t))) return true;

  // Weaker signals — require at least two distinct kinds to avoid false hits on
  // ordinary prose that happens to contain, say, a single asterisk.
  const weak: RegExp[] = [
    /^\s*[-*+]\s+\S/m, // unordered list item
    /^\s*\d+\.\s+\S/m, // ordered list item
    /\[[^\]]+\]\([^)]+\)/, // inline link
    /(\*\*|__)(?=\S)[\s\S]+?\S\1/, // bold
    /(?:^|\s)(\*|_)(?=\S)[^*_\n]+?\S\1(?:\s|$)/, // emphasis
    /`[^`\n]+`/, // inline code
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/m, // thematic break
  ];
  return weak.filter((re) => re.test(t)).length >= 2;
}

/**
 * Load HTML into the editor, sanitizing it first.
 * `dompurify` is lazy-loaded.
 */
export async function importHtml(
  editor: Editor,
  html: string,
): Promise<void> {
  const { default: DOMPurify } = await import("dompurify");
  const clean = DOMPurify.sanitize(html);
  editor.commands.setContent(clean);
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export the editor content as Markdown.
 * `turndown` is lazy-loaded.
 */
export async function exportMarkdown(editor: Editor): Promise<string> {
  const { default: TurndownService } = await import("turndown");
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  return td.turndown(editor.getHTML());
}

/**
 * Export the editor content as a self-contained HTML file.
 * Inlines fonts + basic document styles derived from DocSettings.
 */
export function exportHtml(
  editor: Editor,
  title: string,
  settings: DocSettings,
): string {
  const body = editor.getHTML();
  const fontFamilyMap: Record<string, string> = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, 'JetBrains Mono', monospace",
  };
  const fontFamily =
    fontFamilyMap[settings.typography.fontFamily] ?? fontFamilyMap.sans;
  const fontSize = `${settings.typography.fontSizeBase}px`;
  const lineHeight = String(settings.typography.lineHeight);
  const maxWidth =
    settings.page.width === "full"
      ? "none"
      : settings.page.width === "narrow"
      ? "640px"
      : settings.page.width === "wide"
      ? "1000px"
      : "800px";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || "Document")}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem 1rem;
      font-family: ${fontFamily};
      font-size: ${fontSize};
      line-height: ${lineHeight};
      color: #18181b;
      background: #fafafa;
    }
    .doc-content {
      max-width: ${maxWidth};
      margin: 0 auto;
    }
    h1, h2, h3, h4, h5, h6 { margin: 1.4em 0 0.4em; line-height: 1.25; font-weight: 700; }
    h1 { font-size: 2rem; }
    h2 { font-size: 1.5rem; }
    h3 { font-size: 1.25rem; }
    p { margin: 0 0 0.75em; }
    ul, ol { margin: 0 0 0.75em; padding-left: 1.6em; }
    blockquote { margin: 0.75em 0; padding: 0.4em 1em; border-left: 3px solid #e4e4e7; color: #71717a; }
    code { font-family: ui-monospace, monospace; font-size: 0.875em; background: #e4e4e7; border-radius: 3px; padding: 0.15em 0.35em; }
    pre { background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 1em 1.2em; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    a { color: #1d4ed8; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    td, th { border: 1px solid #e4e4e7; padding: 0.4em 0.7em; }
    th { background: #f4f4f5; font-weight: 600; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #e4e4e7; margin: 1.5em 0; }
  </style>
</head>
<body>
  <div class="doc-content">
    <h1>${escapeHtml(title || "Document")}</h1>
    ${body}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Copy ──────────────────────────────────────────────────────────────────────

/** Copy the editor's HTML to the clipboard. */
export async function copyAsHtml(editor: Editor): Promise<void> {
  const html = editor.getHTML();
  await navigator.clipboard.writeText(html);
}

/** Copy the editor's content as Markdown (lazy turndown). */
export async function copyAsMarkdown(editor: Editor): Promise<void> {
  const md = await exportMarkdown(editor);
  await navigator.clipboard.writeText(md);
}

// ── Print ─────────────────────────────────────────────────────────────────────

export function printDoc(): void {
  window.print();
}

// ── Share via URL hash ────────────────────────────────────────────────────────

const SHARE_WARN_BYTES = 50 * 1024; // 50 KB

/**
 * Gzip + base64url encode {title, doc JSON} into a URL hash fragment.
 * Returns the full URL and an `oversized` flag if > 50 KB.
 */
export async function shareUrl(
  title: string,
  docJson: unknown,
): Promise<ShareResult> {
  const json = JSON.stringify({ title, doc: docJson });
  const encoded = await gzipBase64url(json);
  const url = `${location.origin}${location.pathname}#doc=${encoded}`;
  return {
    url,
    oversized: new TextEncoder().encode(json).length > SHARE_WARN_BYTES,
  };
}

/**
 * Decode a URL hash fragment produced by shareUrl.
 * Returns {title, doc} or null on any error.
 */
export async function decodeShareHash(
  hash: string,
): Promise<{ title: string; doc: unknown } | null> {
  const match = hash.match(/[#&]?doc=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const json = await gunzipBase64url(match[1]);
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "doc" in parsed
    ) {
      return parsed as { title: string; doc: unknown };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Binary download ───────────────────────────────────────────────────────────

/** Download a binary blob to the user's device. */
export function downloadBinary(
  data: ArrayBuffer | Blob,
  filename: string,
  mime = "application/octet-stream",
): void {
  const blob =
    data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── .docx import ──────────────────────────────────────────────────────────────

/**
 * Open a .docx file and import its content into the editor.
 * Uses mammoth (lazy) to convert OOXML → HTML, then sanitizes and loads.
 */
export async function importDocx(editor: Editor): Promise<void> {
  const buf = await pickDocxBuffer();
  if (!buf) return;
  await importDocxBuffer(editor, buf);
}

/** Convert an already-loaded .docx ArrayBuffer into editor content. */
export async function importDocxBuffer(
  editor: Editor,
  buf: ArrayBuffer,
): Promise<void> {
  const [mammoth, { default: DOMPurify }] = await Promise.all([
    import("mammoth"),
    import("dompurify"),
  ]);
  const result = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer: buf });
  const clean = DOMPurify.sanitize(result.value);
  editor.commands.setContent(clean);
}

async function pickDocxBuffer(): Promise<ArrayBuffer | null> {
  if (typeof window !== "undefined" && "showOpenFilePicker" in window) {
    try {
      const [handle] = await (
        window as Window & {
          showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        types: [
          {
            description: "Word document",
            accept: {
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                [".docx"],
            },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      return file.arrayBuffer();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // FSA failed — fall through
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      file.arrayBuffer().then(resolve).catch(() => resolve(null));
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ── .docx export ──────────────────────────────────────────────────────────────

/**
 * Export the editor content as a .docx file.
 * Uses the docx-mapper (lazy) to build the Word document, then downloads it.
 *
 * Known losses: embedded images are omitted; syntax highlighting is stripped
 * to plain text. See docx-mapper.ts for the full conversion notes.
 */
export async function exportDocx(editor: Editor, title: string): Promise<void> {
  const { jsonToDocxBlob } = await import("./docx-mapper");
  const blob = await jsonToDocxBlob(editor.getJSON(), title);
  downloadBinary(
    blob,
    filenameFromTitle(title, "docx"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}

// ── PDF export ────────────────────────────────────────────────────────────────

/**
 * Print the document as PDF.
 * Injects an explicit @page rule for A4 margins + page counter, then triggers
 * the browser's print dialog. The rule is removed on afterprint.
 */
export function exportPdf(): void {
  const id = "doc-pdf-page-rule";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
@page {
  size: A4;
  margin: 20mm;
}
@page :first { margin-top: 25mm; }
    `.trim();
    document.head.appendChild(style);
  }
  window.print();
  window.addEventListener(
    "afterprint",
    () => document.getElementById(id)?.remove(),
    { once: true },
  );
}

// ── PNG export ────────────────────────────────────────────────────────────────

/**
 * Capture the ProseMirror editor element as a PNG image and download it.
 * html-to-image is lazy-loaded (already bundled, ~50 KB).
 */
export async function exportDocPng(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(el, { pixelRatio: 2 });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ── Compression helpers ───────────────────────────────────────────────────────

async function gzipBase64url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  return arrayBufferToBase64url(compressed);
}

async function gunzipBase64url(b64: string): Promise<string> {
  const bytes = base64urlToArrayBuffer(b64);
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  await writer.write(bytes.buffer as ArrayBuffer);
  await writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

function arrayBufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlToArrayBuffer(b64: string): Uint8Array {
  const padded =
    b64.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
