/**
 * Footnote extension — hand-rolled for TipTap v3 compatibility.
 *
 * Architecture:
 *   footnoteRef   — inline node; renders as <sup class="doc-footnote-ref">
 *   footnoteBody  — block node; appears in a <section class="doc-footnotes"> at doc end
 *
 * Display numbers are assigned as ProseMirror decorations (NOT stored in attrs)
 * so renumbering is zero-mutation and never causes infinite transaction loops.
 *
 * Commands:
 *   addFootnote()          — insert ref at cursor + append body at doc end
 *   deleteFootnoteRef(id)  — remove ref + matching body
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

// ── Footnote reference (inline) ───────────────────────────────────────────────

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { id: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote-ref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, {
        "data-footnote-ref": "",
        class: "doc-footnote-ref",
      }),
      "?",
    ];
  },
});

// ── Footnote body (block) ─────────────────────────────────────────────────────

export const FootnoteBody = Node.create({
  name: "footnoteBody",
  group: "block",
  content: "inline*",

  addAttributes() {
    return { id: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "p[data-footnote-body]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-footnote-body": "",
        class: "doc-footnote-body",
      }),
      0,
    ];
  },
});

// ── Decoration plugin — assigns display numbers ───────────────────────────────

const footnotePluginKey = new PluginKey("footnoteNumbers");

const FootnoteNumberPlugin = new Plugin({
  key: footnotePluginKey,

  state: {
    init(_, state) {
      return buildDecorations(state.doc);
    },
    apply(tr, old) {
      return tr.docChanged ? buildDecorations(tr.doc) : old;
    },
  },

  props: {
    decorations(state) {
      return footnotePluginKey.getState(state) as DecorationSet;
    },
  },
});

function buildDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  let n = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === "footnoteRef") {
      n++;
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-footnote-n": String(n),
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

// ── Commands ──────────────────────────────────────────────────────────────────

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      addFootnote: () => ReturnType;
      deleteFootnoteRef: (id: string) => ReturnType;
    };
  }
}

function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

export const FootnoteCommands = Extension.create({
  name: "footnote",

  addProseMirrorPlugins() {
    return [FootnoteNumberPlugin];
  },

  addCommands() {
    return {
      addFootnote:
        () =>
        ({ chain, state }) => {
          const id = uid();
          const { schema } = state;
          const ref = schema.nodes.footnoteRef.create({ id });
          const body = schema.nodes.footnoteBody.create({ id }, [
            schema.text("Footnote text."),
          ]);

          return chain()
            .command(({ tr }) => {
              tr.replaceSelectionWith(ref);
              return true;
            })
            .command(({ tr }) => {
              tr.insert(tr.doc.content.size, body);
              return true;
            })
            .run();
        },

      deleteFootnoteRef:
        (id: string) =>
        ({ chain, state }) => {
          return chain()
            .command(({ tr }) => {
              const { doc } = state;
              let refPos: number | null = null;
              let bodyPos: number | null = null;
              let bodySize = 0;

              doc.descendants((node, pos) => {
                if (node.type.name === "footnoteRef" && node.attrs.id === id) refPos = pos;
                if (node.type.name === "footnoteBody" && node.attrs.id === id) {
                  bodyPos = pos;
                  bodySize = node.nodeSize;
                }
              });

              if (refPos !== null) tr.delete(refPos, refPos + 1);
              if (bodyPos !== null) {
                const shift = refPos !== null ? -1 : 0;
                tr.delete(bodyPos + shift, bodyPos + shift + bodySize);
              }

              return true;
            })
            .run();
        },
    };
  },
});
