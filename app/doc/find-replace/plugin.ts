/**
 * ProseMirror find-and-replace plugin.
 *
 * Manages two concerns:
 *   1. Decoration — highlights all matches in the document with
 *      `.doc-search-match` (all) and `.doc-search-active` (current match).
 *   2. Navigation / mutation — setSearch, nextMatch, prevMatch,
 *      replaceCurrent, replaceAll as functions that dispatch PM transactions.
 *
 * Wrapped in a TipTap Extension so it plugs into the extension array cleanly.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// ── Plugin key & state shape ──────────────────────────────────────────────────

export const findReplaceKey = new PluginKey<FindReplaceState>("docFindReplace");

export type MatchRange = { from: number; to: number };

export type FindReplaceState = {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  isRegex: boolean;
  active: boolean; // whether the modal is open
  matches: MatchRange[];
  current: number; // index into matches
  decorations: DecorationSet;
};

const EMPTY_STATE: FindReplaceState = {
  query: "",
  replacement: "",
  caseSensitive: false,
  isRegex: false,
  active: false,
  matches: [],
  current: 0,
  decorations: DecorationSet.empty,
};

// ── Meta key discriminated union ──────────────────────────────────────────────

type Meta =
  | { type: "open" }
  | { type: "close" }
  | { type: "setQuery"; query: string }
  | { type: "setReplacement"; replacement: string }
  | { type: "setCaseSensitive"; value: boolean }
  | { type: "setRegex"; value: boolean }
  | { type: "next" }
  | { type: "prev" }
  | { type: "replaceCurrent" }
  | { type: "replaceAll" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRegExp(
  query: string,
  caseSensitive: boolean,
  isRegex: boolean,
): RegExp | null {
  if (!query) return null;
  try {
    const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(pattern, flags);
    // Guard against zero-width matches
    if (re.test("")) return null;
    return re;
  } catch {
    return null;
  }
}

function findMatches(doc: EditorState["doc"], re: RegExp): MatchRange[] {
  const matches: MatchRange[] = [];
  const text = doc.textBetween(0, doc.content.size, "\n", "\0");
  let m: RegExpExecArray | null;
  // Walk text offsets, then map back to document positions
  // textBetween uses '\n' between blocks — we need to map char offset → PM pos.
  // Build a char→pos map.
  const charToPos: number[] = [];
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) {
        charToPos.push(pos + i);
      }
    } else if (node.isBlock && charToPos.length > 0) {
      charToPos.push(-1); // separator character
    }
  });

  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    const from = charToPos[m.index];
    const to = charToPos[m.index + m[0].length - 1];
    if (from !== undefined && to !== undefined && from !== -1 && to !== -1) {
      matches.push({ from, to: to + 1 });
    }
  }
  return matches;
}

function buildDecorations(
  doc: EditorState["doc"],
  matches: MatchRange[],
  current: number,
): DecorationSet {
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class:
        i === current
          ? "doc-search-match doc-search-active"
          : "doc-search-match",
    }),
  );
  return DecorationSet.create(doc, decos);
}

function recompute(
  state: FindReplaceState,
  doc: EditorState["doc"],
): FindReplaceState {
  if (!state.active || !state.query) {
    return { ...state, matches: [], current: 0, decorations: DecorationSet.empty };
  }
  const re = buildRegExp(state.query, state.caseSensitive, state.isRegex);
  if (!re) return { ...state, matches: [], current: 0, decorations: DecorationSet.empty };
  const matches = findMatches(doc, re);
  const current = Math.min(state.current, Math.max(0, matches.length - 1));
  return {
    ...state,
    matches,
    current,
    decorations: buildDecorations(doc, matches, current),
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const findReplacePlugin = new Plugin<FindReplaceState>({
  key: findReplaceKey,

  state: {
    init() {
      return EMPTY_STATE;
    },

    apply(tr, prev, _oldState, newState) {
      const meta = tr.getMeta(findReplaceKey) as Meta | undefined;

      let next = { ...prev };

      if (meta) {
        switch (meta.type) {
          case "open":
            next = { ...next, active: true };
            break;
          case "close":
            next = { ...next, active: false, matches: [], current: 0, decorations: DecorationSet.empty };
            break;
          case "setQuery":
            next = { ...next, query: meta.query };
            break;
          case "setReplacement":
            next = { ...next, replacement: meta.replacement };
            break;
          case "setCaseSensitive":
            next = { ...next, caseSensitive: meta.value };
            break;
          case "setRegex":
            next = { ...next, isRegex: meta.value };
            break;
          case "next":
            if (next.matches.length > 0) {
              const current = (next.current + 1) % next.matches.length;
              next = {
                ...next,
                current,
                decorations: buildDecorations(newState.doc, next.matches, current),
              };
            }
            return next;
          case "prev":
            if (next.matches.length > 0) {
              const current =
                (next.current - 1 + next.matches.length) % next.matches.length;
              next = {
                ...next,
                current,
                decorations: buildDecorations(newState.doc, next.matches, current),
              };
            }
            return next;
        }
      }

      // Recompute if the doc changed or a search-affecting meta was dispatched
      if (
        tr.docChanged ||
        meta?.type === "setQuery" ||
        meta?.type === "setCaseSensitive" ||
        meta?.type === "setRegex" ||
        meta?.type === "open"
      ) {
        return recompute(next, newState.doc);
      }

      return next;
    },
  },

  props: {
    decorations(state) {
      return findReplaceKey.getState(state)?.decorations ?? DecorationSet.empty;
    },
  },
});

// ── Extension ─────────────────────────────────────────────────────────────────

export const FindReplace = Extension.create({
  name: "docFindReplace",
  addProseMirrorPlugins() {
    return [findReplacePlugin];
  },
});

// ── Action dispatchers (called from FindReplace.tsx) ──────────────────────────

import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

function dispatch(editor: Editor, meta: Meta) {
  editor.view.dispatch(
    editor.view.state.tr.setMeta(findReplaceKey, meta),
  );
}

export const findReplaceActions = {
  open: (editor: Editor) => dispatch(editor, { type: "open" }),
  close: (editor: Editor) => dispatch(editor, { type: "close" }),
  setQuery: (editor: Editor, query: string) =>
    dispatch(editor, { type: "setQuery", query }),
  setReplacement: (editor: Editor, replacement: string) =>
    dispatch(editor, { type: "setReplacement", replacement }),
  setCaseSensitive: (editor: Editor, value: boolean) =>
    dispatch(editor, { type: "setCaseSensitive", value }),
  setRegex: (editor: Editor, value: boolean) =>
    dispatch(editor, { type: "setRegex", value }),
  next: (editor: Editor) => dispatch(editor, { type: "next" }),
  prev: (editor: Editor) => dispatch(editor, { type: "prev" }),

  replaceCurrent(editor: Editor) {
    const state = findReplaceKey.getState(editor.view.state);
    if (!state || state.matches.length === 0) return;
    const match = state.matches[state.current];
    if (!match) return;
    editor.view.dispatch(
      editor.view.state.tr
        .insertText(state.replacement, match.from, match.to)
        .setMeta(findReplaceKey, { type: "setQuery", query: state.query }),
    );
  },

  replaceAll(editor: Editor) {
    const state = findReplaceKey.getState(editor.view.state);
    if (!state || state.matches.length === 0) return;
    // Apply in reverse order so earlier positions stay valid
    let tr = editor.view.state.tr;
    for (const match of [...state.matches].reverse()) {
      tr = tr.insertText(state.replacement, match.from, match.to);
    }
    editor.view.dispatch(
      tr.setMeta(findReplaceKey, { type: "setQuery", query: state.query }),
    );
  },

  /** Scroll the active match into view. */
  scrollToActive(editor: Editor) {
    const pluginState = findReplaceKey.getState(editor.view.state);
    if (!pluginState || pluginState.matches.length === 0) return;
    const match = pluginState.matches[pluginState.current];
    if (!match) return;
    const { state } = editor.view;
    const sel = TextSelection.create(state.doc, match.from, match.to);
    editor.view.dispatch(state.tr.setSelection(sel).scrollIntoView());
  },
};
