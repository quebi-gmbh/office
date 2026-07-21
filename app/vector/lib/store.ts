/**
 * Minimal observable store for use with React's useSyncExternalStore.
 * Mirrors the paint tool's store — no dependency, shallow-identity gate.
 */
export interface Store<T> {
  getSnapshot(): T;
  setState(updater: (prev: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot() {
      return state;
    },
    setState(updater) {
      const next = updater(state);
      if (next !== state) {
        state = next;
        listeners.forEach((l) => l());
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
