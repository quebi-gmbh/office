/**
 * Snapshot-based undo/redo over the vector {@link VectorScene} (doc + nodes).
 *
 * Scenes are small JSON, so we keep deep-cloned snapshots in two stacks
 * (past/future) with a generous depth cap. The seed snapshot (index 0) can
 * never be undone past, so there is always at least one state to restore.
 */
import type { VectorScene } from "./types";

const MAX_DEPTH = 100;

function clone(scene: VectorScene): VectorScene {
  return typeof structuredClone === "function"
    ? structuredClone(scene)
    : (JSON.parse(JSON.stringify(scene)) as VectorScene);
}

export interface History {
  push(scene: VectorScene): void;
  undo(): VectorScene | null;
  redo(): VectorScene | null;
  canUndo(): boolean;
  canRedo(): boolean;
  reset(seed: VectorScene): void;
}

export function createHistory(seed: VectorScene): History {
  let past: VectorScene[] = [clone(seed)];
  let future: VectorScene[] = [];

  return {
    push(scene) {
      past.push(clone(scene));
      future = [];
      if (past.length > MAX_DEPTH) past.shift();
    },
    undo() {
      if (past.length < 2) return null;
      const current = past.pop()!;
      future.unshift(current);
      return clone(past[past.length - 1]);
    },
    redo() {
      if (future.length === 0) return null;
      const next = future.shift()!;
      past.push(next);
      return clone(next);
    },
    canUndo() {
      return past.length >= 2;
    },
    canRedo() {
      return future.length > 0;
    },
    reset(seed) {
      past = [clone(seed)];
      future = [];
    },
  };
}
