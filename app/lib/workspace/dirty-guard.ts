/**
 * Tracks the currently-focused editor's unsaved state so the app can warn
 * before navigating away. Each tool registers a guard via `useUnsavedGuard`;
 * the `NavigationGuard` (mounted in the root layout) reads the active one.
 *
 * Only one editor is active at a time (routes are mutually exclusive), so a
 * single-slot registry is enough.
 */
import { useEffect, useRef } from "react";

export interface DirtyGuard {
  /** True when there are unsaved changes worth warning about. */
  isDirty: () => boolean;
  /** Persist the document. Resolve true if handled (saved or downloaded). */
  save: () => Promise<boolean>;
  /** Human-friendly document name for the prompt. */
  name: () => string;
}

let current: DirtyGuard | null = null;

export function isCurrentlyDirty(): boolean {
  try {
    return current?.isDirty() ?? false;
  } catch {
    return false;
  }
}

export async function saveCurrent(): Promise<boolean> {
  try {
    return current ? await current.save() : true;
  } catch {
    return false;
  }
}

export function currentName(): string {
  try {
    return current?.name() || "this document";
  } catch {
    return "this document";
  }
}

/**
 * Register this component as the active unsaved-changes guard for as long as it
 * is mounted. The passed getters are read live (latest render's closures).
 */
export function useUnsavedGuard(guard: DirtyGuard): void {
  const ref = useRef(guard);
  ref.current = guard;
  useEffect(() => {
    const proxy: DirtyGuard = {
      isDirty: () => ref.current.isDirty(),
      save: () => ref.current.save(),
      name: () => ref.current.name(),
    };
    current = proxy;
    return () => {
      if (current === proxy) current = null;
    };
  }, []);
}
