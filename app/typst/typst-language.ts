/**
 * A lightweight CodeMirror 6 language mode for Typst markup.
 *
 * This is a best-effort *stream* tokenizer (not a full Lezer grammar): it's
 * enough to colour the common constructs — headings, emphasis, raw/code, math,
 * comments, strings, numbers, and `#`-prefixed code keywords/functions — which
 * is all the editor needs for readable highlighting. It intentionally errs
 * toward simple heuristics over perfect accuracy.
 */
import { StreamLanguage, LanguageSupport } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

interface TypstState {
  blockComment: boolean;
  math: boolean;
  /** Non-null while inside a ``` raw block; holds the closing fence. */
  rawFence: string | null;
}

const KEYWORDS = new Set([
  "let",
  "set",
  "show",
  "import",
  "include",
  "if",
  "else",
  "for",
  "while",
  "in",
  "return",
  "break",
  "continue",
  "context",
  "as",
]);

const ATOMS = new Set(["none", "auto", "true", "false"]);

export const typstStreamParser = StreamLanguage.define<TypstState>({
  name: "typst",
  startState: () => ({ blockComment: false, math: false, rawFence: null }),

  token(stream, state) {
    // --- multi-line states -------------------------------------------------
    if (state.blockComment) {
      if (stream.match(/.*?\*\//)) state.blockComment = false;
      else stream.skipToEnd();
      return "comment";
    }
    if (state.rawFence) {
      if (stream.sol() && stream.match(state.rawFence)) {
        state.rawFence = null;
        return "raw";
      }
      stream.skipToEnd();
      return "raw";
    }
    if (state.math) {
      if (stream.match(/[^$]*\$/)) state.math = false;
      else stream.skipToEnd();
      return "math";
    }

    // --- headings (line starting with one or more `=`) ---------------------
    if (stream.sol() && stream.match(/^\s*=+\s+/)) {
      stream.skipToEnd();
      return "heading";
    }

    if (stream.eatSpace()) return null;

    // --- comments ----------------------------------------------------------
    if (stream.match("/*")) {
      state.blockComment = true;
      return "comment";
    }
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    // --- raw / code blocks and inline raw ----------------------------------
    if (stream.match(/^```[a-zA-Z0-9_-]*/)) {
      state.rawFence = "```";
      return "raw";
    }
    if (stream.match(/`[^`]*`/)) return "raw";

    // --- math --------------------------------------------------------------
    if (stream.match("$")) {
      if (!stream.match(/[^$]*\$/)) state.math = true;
      return "math";
    }

    // --- emphasis / strong (inline, single line) ---------------------------
    if (stream.match(/\*[^*\n]+\*/)) return "strong";
    if (stream.match(/_[^_\n]+_/)) return "emphasis";

    // --- labels & references ----------------------------------------------
    if (stream.match(/<[a-zA-Z_][\w-]*>/)) return "label";
    if (stream.match(/@[a-zA-Z_][\w-]*/)) return "label";

    // --- strings -----------------------------------------------------------
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";

    // --- `#` code entry, keywords, and function calls ----------------------
    if (stream.match(/#[a-zA-Z_][\w.]*/)) {
      return "hashcall";
    }

    // --- bare identifiers / keywords in code -------------------------------
    const word = stream.match(/[a-zA-Z_][\w-]*/);
    if (word && word !== true) {
      const w = word[0];
      if (KEYWORDS.has(w)) return "keyword";
      if (ATOMS.has(w)) return "atom";
      return "variable";
    }

    // --- numbers (incl. units like 12pt, 2cm, 50%) -------------------------
    if (stream.match(/\d+(?:\.\d+)?(?:pt|mm|cm|in|em|fr|deg|%)?/)) {
      return "number";
    }

    stream.next();
    return null;
  },

  tokenTable: {
    comment: t.lineComment,
    heading: t.heading,
    strong: t.strong,
    emphasis: t.emphasis,
    raw: t.monospace,
    math: t.special(t.string),
    string: t.string,
    keyword: t.keyword,
    atom: t.atom,
    variable: t.variableName,
    number: t.number,
    label: t.labelName,
    hashcall: t.function(t.variableName),
  },

  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});

/** CodeMirror language support for Typst. */
export function typst(): LanguageSupport {
  return new LanguageSupport(typstStreamParser);
}
