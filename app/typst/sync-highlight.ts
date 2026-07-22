/**
 * A small CodeMirror extension that highlights a single line, used to show the
 * editor location corresponding to a preview interaction (reference click or
 * text selection). Set via the `setSyncLine` effect; pass `null` to clear.
 */
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/** Effect: highlight the line containing `pos`, or clear when `null`. */
export const setSyncLine = StateEffect.define<number | null>();

const lineMark = Decoration.line({ class: "cm-syncLine" });

const syncLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setSyncLine)) {
        if (e.value == null) {
          deco = Decoration.none;
        } else {
          const pos = Math.max(0, Math.min(e.value, tr.state.doc.length));
          const line = tr.state.doc.lineAt(pos);
          deco = Decoration.set([lineMark.range(line.from)]);
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const syncLineTheme = EditorView.theme({
  ".cm-syncLine": {
    // Quebi mint wash + mint-strong edge bar, tuned for the light editor.
    backgroundColor: "rgba(45, 212, 168, 0.18)",
    boxShadow: "inset 2px 0 0 #14b88f",
  },
});

/** CodeMirror extension enabling the sync line highlight. */
export function syncHighlight() {
  return [syncLineField, syncLineTheme];
}
