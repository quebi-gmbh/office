/**
 * TipTap extension list for the document editor.
 *
 * StarterKit v3 bundles: Bold, Italic, Underline, Strike, Code,
 * Heading (H1–H6), Paragraph, BulletList, OrderedList, ListItem,
 * Blockquote, HardBreak, HorizontalRule, Link (autolink), UndoRedo,
 * Dropcursor, Gapcursor, CharacterCount, TextStyle, Focus, Selection.
 *
 * Smart typography is Bucket-B (requires editor recreation when toggled).
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
import { Typography } from "@tiptap/extension-typography";
import { lowlight } from "./lowlight";
import { SlashMenu } from "./slash-menu";
import { FindReplace } from "./find-replace/plugin";
import { FootnoteRef, FootnoteBody, FootnoteCommands } from "./extensions/footnote";
import { PageBreak } from "./extensions/page-break";
import { YouTubeEmbed } from "./extensions/youtube-embed";
import { AnchorMenu } from "./anchor-menu";

export function buildExtensions(smartTypography = false) {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true },
    }),

    Placeholder.configure({ placeholder: "Start writing…" }),

    // ── Text alignment ──────────────────────────────────────────────────────
    TextAlign.configure({ types: ["heading", "paragraph"] }),

    // ── Text color + highlight ──────────────────────────────────────────────
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),

    // ── Superscript / subscript ─────────────────────────────────────────────
    Superscript,
    Subscript,

    // ── Task lists ──────────────────────────────────────────────────────────
    TaskList,
    TaskItem.configure({ nested: true }),

    // ── Tables ──────────────────────────────────────────────────────────────
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,

    // ── Images (base64 inline) ──────────────────────────────────────────────
    Image.configure({ inline: false, allowBase64: true }),

    // ── Syntax-highlighted code blocks ──────────────────────────────────────
    CodeBlockLowlight.configure({ lowlight }),

    // ── Smart typography (Bucket-B) ─────────────────────────────────────────
    ...(smartTypography ? [Typography] : []),

    // ── Slash menu (/‐triggered insert popover) ─────────────────────────────
    SlashMenu,

    // ── Find & replace ──────────────────────────────────────────────────────
    FindReplace,

    // ── Tier 3: Footnotes ───────────────────────────────────────────────────
    FootnoteRef,
    FootnoteBody,
    FootnoteCommands,

    // ── Tier 3: Page break ──────────────────────────────────────────────────
    PageBreak,

    // ── Tier 3: YouTube / Vimeo embeds ─────────────────────────────────────
    YouTubeEmbed,

    // ── Tier 3: /@ anchor link menu ────────────────────────────────────────
    AnchorMenu,
  ];
}

/** Static extension list (smart typography off). For SSR / initial render. */
export const extensions = buildExtensions(false);
