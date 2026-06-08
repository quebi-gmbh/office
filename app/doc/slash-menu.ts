/**
 * Slash menu extension for the document editor.
 *
 * Typing "/" at the start of text (or after whitespace) opens a popover
 * showing a list of block-insert commands. Filtered by the query typed after "/".
 *
 * Uses @tiptap/suggestion under the hood; renders SlashMenuList via
 * ReactRenderer from @tiptap/react (no tippy.js dependency — position is
 * derived from the suggestion's clientRect).
 */
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

const slashMenuPluginKey = new PluginKey("slashMenu");
import type { SlashMenuHandle, SlashMenuItem } from "./slash-menu-list";
import { SlashMenuList } from "./slash-menu-list";

// ── Command definitions ───────────────────────────────────────────────────────

function buildItems(editor: Editor): SlashMenuItem[] {
  return [
    {
      title: "Paragraph",
      description: "Plain text paragraph",
      icon: "¶",
      command: () => editor.chain().focus().setParagraph().run(),
    },
    {
      title: "Heading 1",
      description: "Large section heading",
      icon: "H1",
      command: () =>
        editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: "Heading 2",
      description: "Medium sub-heading",
      icon: "H2",
      command: () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: "Heading 3",
      description: "Small sub-heading",
      icon: "H3",
      command: () =>
        editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: "Bullet list",
      description: "Unordered list",
      icon: "•",
      command: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      description: "Ordered list",
      icon: "1.",
      command: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: "Task list",
      description: "Interactive checkboxes",
      icon: "☑",
      command: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      title: "Blockquote",
      description: "Indented quote block",
      icon: '"',
      command: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: "Code block",
      description: "Syntax-highlighted code",
      icon: "<>",
      command: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      title: "Table",
      description: "Insert a 3×3 table",
      icon: "⊞",
      command: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      title: "Horizontal rule",
      description: "Divider line",
      icon: "—",
      command: () => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      title: "Page break",
      description: "Force a new page in print / PDF",
      icon: "⊟",
      command: () => editor.chain().focus().setPageBreak().run(),
    },
    {
      title: "Footnote",
      description: "Insert a numbered footnote",
      icon: "fn",
      command: () => editor.chain().focus().addFootnote().run(),
    },
    {
      title: "YouTube / Vimeo",
      description: "Embed a video",
      icon: "▶",
      command: () => {
        const url = window.prompt("YouTube or Vimeo URL:");
        if (url?.trim()) editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
      },
    },
  ];
}

// ── Suggestion configuration ──────────────────────────────────────────────────

function buildSuggestionConfig(editor: Editor): Partial<SuggestionOptions> {
  return {
    char: "/",
    allowSpaces: false,
    startOfLine: false,

    items({ query }: { query: string }) {
      const all = buildItems(editor);
      if (!query) return all;
      const q = query.toLowerCase();
      return all.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q),
      );
    },

    render() {
      let component: ReactRenderer<SlashMenuHandle> | null = null;
      let popup: HTMLDivElement | null = null;

      return {
        onStart(props) {
          component = new ReactRenderer(SlashMenuList, {
            props: {
              items: props.items,
              command: (item: SlashMenuItem) => {
                props.command({ item });
              },
            },
            editor: props.editor,
          });

          // Create a floating container and position it
          popup = document.createElement("div");
          popup.style.position = "absolute";
          popup.style.zIndex = "9999";
          document.body.appendChild(popup);
          popup.appendChild(component.element);

          const rect = props.clientRect?.();
          if (rect && popup) {
            popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
            popup.style.left = `${rect.left + window.scrollX}px`;
          }
        },

        onUpdate(props) {
          component?.updateProps({
            items: props.items,
            command: (item: SlashMenuItem) => {
              props.command({ item });
            },
          });

          const rect = props.clientRect?.();
          if (rect && popup) {
            popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
            popup.style.left = `${rect.left + window.scrollX}px`;
          }
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.remove();
            component?.destroy();
            return true;
          }
          return component?.ref?.onKeyDown(props.event) ?? false;
        },

        onExit() {
          popup?.remove();
          popup = null;
          component?.destroy();
          component = null;
        },
      };
    },

    command({ editor: ed, range, props }) {
      // Delete the "/" + query, then run the item's command
      ed.chain().focus().deleteRange(range).run();
      (props.item as SlashMenuItem).command();
    },
  };
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const SlashMenu = Extension.create({
  name: "slashMenu",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: slashMenuPluginKey,
        ...buildSuggestionConfig(this.editor),
      }),
    ];
  },
});
