/**
 * AnchorMenu — /@-triggered suggestion that inserts a link to a heading anchor.
 *
 * Typing "/@ " opens a popover listing all headings. Selecting one inserts:
 *   <a href="#heading-slug">Heading text</a>
 *
 * HeadingIdPlugin assigns id attrs to rendered heading DOM nodes after each
 * document update (without storing them in the doc JSON — decoration-only).
 */
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { SlashMenuHandle, SlashMenuItem } from "./slash-menu-list";
import { SlashMenuList } from "./slash-menu-list";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// ── Slug helper ───────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// ── Plugin keys ──────────────────────────────────────────────────────────────
// Each suggestion extension must have a unique PluginKey — sharing the default
// "suggestion" key causes a ProseMirror crash when both are active together.

const anchorMenuPluginKey = new PluginKey("anchorMenu");

// ── Plugin to stamp id attrs on heading DOM nodes ─────────────────────────────

const headingIdKey = new PluginKey("headingIds");

const HeadingIdPlugin = new Plugin({
  key: headingIdKey,
  view() {
    return {
      update(view) {
        const headings =
          view.dom.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
        headings.forEach((el) => {
          const text = el.textContent ?? "";
          const slug = slugify(text);
          if (slug) el.id = `heading-${slug}`;
        });
      },
    };
  },
});

// ── Heading extractor ─────────────────────────────────────────────────────────

function getHeadings(editor: Editor): SlashMenuItem[] {
  const items: SlashMenuItem[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      const text = node.textContent;
      if (!text.trim()) return;
      const slug = slugify(text);
      const level = node.attrs.level as number;
      items.push({
        title: text,
        description: `H${level}`,
        icon: `H${level}`,
        command: () => {
          editor
            .chain()
            .focus()
            .insertContent(
              `<a href="#heading-${slug}">${text}</a>`,
            )
            .run();
        },
      });
    }
  });
  return items;
}

// ── Suggestion config ─────────────────────────────────────────────────────────

function buildAnchorSuggestion(
  editor: Editor,
): Partial<SuggestionOptions> {
  return {
    char: "/@",
    allowSpaces: false,
    startOfLine: false,

    items({ query }: { query: string }) {
      const all = getHeadings(editor);
      if (!query) return all;
      const q = query.toLowerCase();
      return all.filter((item) => item.title.toLowerCase().includes(q));
    },

    render() {
      let component: ReactRenderer<SlashMenuHandle> | null = null;
      let popup: HTMLDivElement | null = null;

      return {
        onStart(props) {
          component = new ReactRenderer(SlashMenuList, {
            props: {
              items: props.items,
              command: (item: SlashMenuItem) => props.command({ item }),
            },
            editor: props.editor,
          });
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
            command: (item: SlashMenuItem) => props.command({ item }),
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
      ed.chain().focus().deleteRange(range).run();
      (props.item as SlashMenuItem).command();
    },
  };
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const AnchorMenu = Extension.create({
  name: "anchorMenu",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: anchorMenuPluginKey,
        ...buildAnchorSuggestion(this.editor),
      }),
      HeadingIdPlugin,
    ];
  },
});
