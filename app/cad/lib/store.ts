/**
 * The CAD document store — zustand + immer holding the parametric feature tree,
 * selection / sketch-edit UI state, undo-redo, and the latest kernel evaluation.
 *
 * Mutations go through {@link CadStore.update} (whole-doc) or
 * {@link CadStore.updateSketch}; both apply an immer recipe and push a history
 * snapshot. Evaluation and autosave are driven by the `useCad` hook, which
 * subscribes to `doc` changes — keeping this store free of side effects.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { createHistory, type History } from "./history";
import type { MeshData } from "../kernel/protocol";
import type { CadDoc, Feature, Sketch } from "./types";

export type EvalStatus = "idle" | "pending" | "ok" | "error";

export interface EvalSnapshot {
  mesh: MeshData;
  bbox?: [number, number, number, number, number, number];
  volume: number;
  surfaceArea: number;
  triangles: number;
}

export interface CadState {
  doc: CadDoc;
  selectedId: string | null;
  /** The sketch currently open in the 2-D editor, or null. */
  editingSketchId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  evalStatus: EvalStatus;
  evalResult: EvalSnapshot | null;
  warnings: string[];
  evalError: string | null;

  update(recipe: (doc: CadDoc) => void): void;
  updateSketch(sketchId: string, recipe: (sketch: Sketch) => void): void;
  addFeature(feature: Feature, select?: boolean): void;
  removeFeature(id: string): void;
  moveFeature(id: string, dir: -1 | 1): void;
  setDoc(doc: CadDoc, resetHistory?: boolean): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  openSketch(id: string | null): void;
  setEvalPending(): void;
  setEvalResult(snap: EvalSnapshot, warnings: string[]): void;
  setEvalError(error: string, warnings: string[]): void;
}

export type CadStore = StoreApi<CadState>;

export function createCadStore(initial: CadDoc): CadStore {
  const history: History = createHistory(initial);

  return createStore<CadState>()(
    immer((set, get) => {
      function afterMutation() {
        history.push(get().doc);
        set((s) => {
          s.canUndo = history.canUndo();
          s.canRedo = history.canRedo();
        });
      }

      return {
        doc: initial,
        selectedId: null,
        editingSketchId: null,
        canUndo: false,
        canRedo: false,
        evalStatus: "idle",
        evalResult: null,
        warnings: [],
        evalError: null,

        update(recipe) {
          set((s) => {
            recipe(s.doc);
          });
          afterMutation();
        },

        updateSketch(sketchId, recipe) {
          set((s) => {
            const f = s.doc.features.find((x) => x.id === sketchId);
            if (f && f.type === "sketch") recipe(f.sketch);
          });
          afterMutation();
        },

        addFeature(feature, selectIt = true) {
          set((s) => {
            s.doc.features.push(feature);
            if (selectIt) s.selectedId = feature.id;
          });
          afterMutation();
        },

        removeFeature(id) {
          set((s) => {
            s.doc.features = s.doc.features.filter((f) => f.id !== id);
            if (s.selectedId === id) s.selectedId = null;
            if (s.editingSketchId === id) s.editingSketchId = null;
          });
          afterMutation();
        },

        moveFeature(id, dir) {
          set((s) => {
            const i = s.doc.features.findIndex((f) => f.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= s.doc.features.length) return;
            const [f] = s.doc.features.splice(i, 1);
            s.doc.features.splice(j, 0, f);
          });
          afterMutation();
        },

        setDoc(doc, resetHistory = true) {
          set((s) => {
            s.doc = doc;
            s.selectedId = null;
            s.editingSketchId = null;
          });
          if (resetHistory) {
            history.reset(doc);
            set((s) => {
              s.canUndo = history.canUndo();
              s.canRedo = history.canRedo();
            });
          } else {
            afterMutation();
          }
        },

        undo() {
          const d = history.undo();
          if (!d) return;
          set((s) => {
            s.doc = d;
            s.canUndo = history.canUndo();
            s.canRedo = history.canRedo();
            if (s.editingSketchId && !d.features.some((f) => f.id === s.editingSketchId)) {
              s.editingSketchId = null;
            }
          });
        },

        redo() {
          const d = history.redo();
          if (!d) return;
          set((s) => {
            s.doc = d;
            s.canUndo = history.canUndo();
            s.canRedo = history.canRedo();
          });
        },

        select(id) {
          set((s) => {
            s.selectedId = id;
          });
        },

        openSketch(id) {
          set((s) => {
            s.editingSketchId = id;
            if (id) s.selectedId = id;
          });
        },

        setEvalPending() {
          set((s) => {
            s.evalStatus = "pending";
          });
        },

        setEvalResult(snap, warnings) {
          set((s) => {
            s.evalStatus = "ok";
            s.evalResult = snap;
            s.warnings = warnings;
            s.evalError = null;
          });
        },

        setEvalError(error, warnings) {
          set((s) => {
            s.evalStatus = "error";
            s.evalError = error;
            s.warnings = warnings;
          });
        },
      };
    }),
  );
}
