/**
 * TipTap extension list for the document editor.
 *
 * StarterKit v3 already bundles: Bold, Italic, **Underline**, Strike, Code,
 * CodeBlock, Heading (H1–H6), Paragraph, BulletList, OrderedList, ListItem,
 * Blockquote, HardBreak, HorizontalRule, **Link** (autolink), UndoRedo,
 * Dropcursor, Gapcursor, CharacterCount, TextStyle, Focus, Selection,
 * Collaboration (optional).
 *
 * IMPORTANT: Underline and Link are configured via StarterKit.configure so we
 * don't double-register them (the old Tier 1 @tiptap/extension-underline dep
 * is intentionally NOT imported here — use StarterKit's built-in copy).
 */
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Superscript } from "@tiptap/extension-superscript";
import { Subscript } from "@tiptap/extension-subscript";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Image } from "@tiptap/extension-image";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "./lowlight";

export const extensions = [
  StarterKit.configure({
    // Disable the full code-block (syntax-highlighted blocks are Tier 4).
    // Inline `code` mark is still active.
    codeBlock: false,
    // Configure Link (bundled in StarterKit v3) — no separate import needed.
    link: {
      openOnClick: false,
      autolink: true,
    },
    // Underline is also bundled in StarterKit v3 — no separate import needed.
    // Leave at defaults (enabled).
  }),

  Placeholder.configure({
    placeholder: "Start writing…",
  }),

  // ── Text alignment ─────────────────────────────────────────────────────────
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),

  // ── Text color + highlight ─────────────────────────────────────────────────
  // TextStyle is the base mark required by Color.
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),

  // ── Superscript / subscript ────────────────────────────────────────────────
  Superscript,
  Subscript,

  // ── Task lists (interactive checkboxes) ───────────────────────────────────
  TaskList,
  TaskItem.configure({ nested: true }),

  // ── Tables ────────────────────────────────────────────────────────────────
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,

  // ── Images (base64 inline, no backend) ────────────────────────────────────
  Image.configure({ inline: false, allowBase64: true }),

  // ── Syntax-highlighted code blocks ────────────────────────────────────────
  // Lowlight replaces StarterKit's plain codeBlock (disabled above).
  // Lazy language packs are loaded on demand via loadLanguage() in lowlight.ts.
  CodeBlockLowlight.configure({ lowlight }),
];
