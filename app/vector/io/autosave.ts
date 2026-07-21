/**
 * Autosave — persists the current scene to localStorage (debounced), and
 * immediately when the tab is hidden. The scene is small JSON, so localStorage
 * is a good fit (per the issue's "autosave to localStorage" requirement).
 */
import { sceneFromJson, sceneToJson } from "~/vector/lib/serialize";
import type { VectorScene } from "~/vector/lib/types";

const KEY = "office:vector:autosave";
const META_KEY = "office:vector:autosave:meta";
const DEBOUNCE_MS = 800;

export interface AutosaveMeta {
  savedAt: number;
}

export function loadAutosave(): VectorScene | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return sceneFromJson(raw);
  } catch {
    return null;
  }
}

export function loadAutosaveMeta(): AutosaveMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as AutosaveMeta) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(META_KEY);
  } catch {}
}

function write(scene: VectorScene): void {
  try {
    localStorage.setItem(KEY, sceneToJson(scene));
    localStorage.setItem(META_KEY, JSON.stringify({ savedAt: Date.now() } satisfies AutosaveMeta));
  } catch {
    // Quota exceeded or storage disabled — non-fatal.
  }
}

export interface Autosave {
  start(getScene: () => VectorScene): void;
  stop(): void;
  /** Mark the scene dirty; schedules a debounced write. */
  schedule(): void;
  /** Write immediately (used on tab-hide). */
  flush(): void;
}

export function createAutosave(): Autosave {
  let getScene: (() => VectorScene) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function save(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (getScene) write(getScene());
  }

  function onVisibility(): void {
    if (document.visibilityState === "hidden") save();
  }

  return {
    start(gs) {
      getScene = gs;
      document.addEventListener("visibilitychange", onVisibility);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
    },
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    },
    flush() {
      save();
    },
  };
}
