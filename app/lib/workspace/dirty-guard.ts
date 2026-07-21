/**
 * Reactive registry of the currently-focused editor's unsaved state + save
 * action. Each tool registers via `useUnsavedGuard({ dirty, name, save })`; the
 * header Save button (`SaveButton`) and the `NavigationGuard` both read the
 * active registration through `useGuardState()`.
 *
 * "dirty" means changed since the last save/open — NOT the tool's internal
 * draft-autosave flag — so navigating away reliably prompts.
 *
 * Only one editor is active at a time (routes are mutually exclusive), so a
 * single slot with an owner token is enough.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

export interface GuardState {
  active: boolean;
  dirty: boolean;
  name: string;
  save: () => Promise<boolean>;
  owner: number;
}

const IDLE: GuardState = {
  active: false,
  dirty: false,
  name: "",
  save: async () => true,
  owner: 0,
};

let state: GuardState = IDLE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}
function getServerSnapshot() {
  return IDLE;
}

export function useGuardState(): GuardState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function isCurrentlyDirty(): boolean {
  return state.active && state.dirty;
}
export async function saveCurrent(): Promise<boolean> {
  try {
    return state.active ? await state.save() : true;
  } catch {
    return false;
  }
}
export function currentName(): string {
  return state.name || "this document";
}

let nextToken = 0;

export interface UnsavedGuardOptions {
  /** True when there are changes worth warning about (since last save/open). */
  dirty: boolean;
  /** Human-friendly document name for the prompt / Save button. */
  name: string;
  /** Persist the document. Resolve true if handled (saved or downloaded). */
  save: () => Promise<boolean>;
}

/**
 * Register this component as the active guard while mounted, keeping the store
 * in sync as `dirty`/`name` change (save is read live via a ref).
 */
export function useUnsavedGuard({ dirty, name, save }: UnsavedGuardOptions): void {
  const saveRef = useRef(save);
  saveRef.current = save;
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++nextToken;

  // Claim the slot on mount; release it on unmount (only if still owner).
  useEffect(() => {
    const id = idRef.current;
    return () => {
      if (state.owner === id) {
        state = IDLE;
        emit();
      }
    };
  }, []);

  // Push the latest dirty/name (no cleanup → no transient IDLE flicker).
  useEffect(() => {
    state = {
      active: true,
      dirty,
      name,
      save: () => saveRef.current(),
      owner: idRef.current,
    };
    emit();
  }, [dirty, name]);
}
