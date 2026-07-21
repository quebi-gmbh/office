/**
 * Snapshot-based undo/redo over the {@link CadDoc}. Documents are small JSON, so
 * we keep deep-cloned snapshots in past/future stacks with a depth cap. The seed
 * (index 0) can never be undone past, so there is always a state to restore.
 */
import type { CadDoc } from "./types";

const MAX_DEPTH = 100;

function clone(doc: CadDoc): CadDoc {
  return typeof structuredClone === "function"
    ? structuredClone(doc)
    : (JSON.parse(JSON.stringify(doc)) as CadDoc);
}

export interface History {
  push(doc: CadDoc): void;
  undo(): CadDoc | null;
  redo(): CadDoc | null;
  canUndo(): boolean;
  canRedo(): boolean;
  reset(seed: CadDoc): void;
}

export function createHistory(seed: CadDoc): History {
  let past: CadDoc[] = [clone(seed)];
  let future: CadDoc[] = [];

  return {
    push(doc) {
      past.push(clone(doc));
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
