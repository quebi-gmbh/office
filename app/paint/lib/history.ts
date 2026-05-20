/**
 * Snapshot-based history stack.
 *
 * Memory budget:
 *   depth = clamp(floor(750_000_000 / (w * h * 4)), 8, 50)
 *   So at 1280×720 (≈3.7 M bytes/frame) depth stays at 50 → ~184 MB worst case.
 *   At 4000×3000 (≈48 M bytes/frame) depth scales to 15 → ~720 MB worst case.
 *   At 2048×2048 (≈16.7 M bytes/frame) depth scales to 44 → ~737 MB.
 *   This is still sizable, but bounded per session and comparable to other apps.
 *
 * Design: two arrays (past, future) of ImageData.
 *   push(s)  — add s to past, clear future, evict oldest if over depth.
 *   undo()   — move tail of past to future, return new tail of past to restore.
 *   redo()   — move head of future back to past, return it to restore.
 *   The very first push (after reset) is the "seed" (blank canvas).
 *   Undo cannot go below the seed, so there is always at least one snapshot.
 */
export interface History {
  push(snapshot: ImageData): void;
  undo(): ImageData | null;
  redo(): ImageData | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Replace the stack with a single seed snapshot (used on new-doc / canvas-resize). */
  reset(seed: ImageData): void;
  depth: number;
}

function calcDepth(w: number, h: number): number {
  return Math.max(8, Math.min(50, Math.floor(750_000_000 / (w * h * 4))));
}

export function createHistory(width: number, height: number): History {
  let past: ImageData[] = [];
  let future: ImageData[] = [];
  let depth = calcDepth(width, height);

  return {
    get depth() {
      return depth;
    },

    push(snapshot) {
      past.push(snapshot);
      future = [];
      if (past.length > depth) past.shift();
    },

    undo() {
      // Need at least 2 frames: the one to pop (current) and the one to restore (previous).
      if (past.length < 2) return null;
      const current = past.pop()!;
      future.unshift(current);
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

    reset(seed) {
      depth = calcDepth(seed.width, seed.height);
      past = [seed];
      future = [];
    },
  };
}
