/**
 * Generic snapshot-based undo/redo stack.
 *
 * Table docs share their column arrays structurally between successive states
 * (see model.ts), so a snapshot is just a doc reference — cheap to keep. We cap
 * the depth so a long editing session can't grow the stack without bound.
 */
export interface History<T> {
  /** Record a new committed state. Clears the redo branch. */
  push(state: T): void;
  /** Step back; returns the state to restore, or null at the bottom. */
  undo(): T | null;
  /** Step forward; returns the state to restore, or null at the top. */
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Reset the stack to a single seed state. */
  reset(seed: T): void;
}

export function createHistory<T>(seed: T, depth = 100): History<T> {
  let past: T[] = [seed];
  let future: T[] = [];

  return {
    push(state) {
      if (state === past[past.length - 1]) return;
      past.push(state);
      future = [];
      if (past.length > depth) past.shift();
    },
    undo() {
      if (past.length < 2) return null;
      future.unshift(past.pop()!);
      return past[past.length - 1];
    },
    redo() {
      if (future.length === 0) return null;
      const next = future.shift()!;
      past.push(next);
      return next;
    },
    canUndo() {
      return past.length >= 2;
    },
    canRedo() {
      return future.length > 0;
    },
    reset(s) {
      past = [s];
      future = [];
    },
  };
}
