/**
 * PageBreak node extension.
 *
 * On screen: a dashed divider (styled via .doc-page-break in app.css).
 * In print / PDF: triggers a CSS page break (break-after: page).
 *
 * Command:  setPageBreak()
 */
import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-type='pageBreak']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "pageBreak",
        class: "doc-page-break",
        contenteditable: "false",
      }),
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: "pageBreak" }).run(),
    };
  },
});
