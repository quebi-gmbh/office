import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";

/**
 * TipTap extension list for the document editor.
 *
 * StarterKit v3 already bundles: Bold, Italic, Underline, Strike, Code,
 * CodeBlock, Heading (H1–H6), Paragraph, BulletList, OrderedList, Blockquote,
 * HardBreak, HorizontalRule, Link (autolink), UndoRedo, Dropcursor, Gapcursor.
 *
 * We configure Link (openOnClick off) and disable CodeBlock (out of scope for
 * Tier 1; plain Code inline is kept). Placeholder is the only separate extension.
 */
export const extensions = [
  StarterKit.configure({
    // Disable the full code-block (syntax-highlighted blocks are Tier 2).
    // Inline `code` mark is still active.
    codeBlock: false,
    link: {
      openOnClick: false,
      autolink: true,
    },
  }),
  Placeholder.configure({
    placeholder: "Start writing…",
  }),
];
