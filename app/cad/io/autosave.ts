/**
 * Autosave + named documents in localStorage.
 *   - The *autosave* slot holds the working document, written debounced and on
 *     tab-hide, and offered for restore on the next visit.
 *   - *Named documents* are an explicit save-as store the user can reopen.
 */
import { docFromJson, docToJson } from "../lib/serialize";
import type { CadDoc } from "../lib/types";

const AUTOSAVE_KEY = "office:cad:autosave";
const AUTOSAVE_META_KEY = "office:cad:autosave:meta";
const DOCS_KEY = "office:cad:documents";
const DEBOUNCE_MS = 800;

export interface AutosaveMeta {
  savedAt: number;
  name: string;
}

export function loadAutosave(): CadDoc | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? docFromJson(raw) : null;
  } catch {
    return null;
  }
}

export function loadAutosaveMeta(): AutosaveMeta | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_META_KEY);
    return raw ? (JSON.parse(raw) as AutosaveMeta) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_META_KEY);
  } catch {
    /* ignore */
  }
}

function writeAutosave(doc: CadDoc): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, docToJson(doc));
    localStorage.setItem(
      AUTOSAVE_META_KEY,
      JSON.stringify({ savedAt: Date.now(), name: doc.name } satisfies AutosaveMeta),
    );
  } catch {
    /* quota / disabled — non-fatal */
  }
}

export interface Autosave {
  start(getDoc: () => CadDoc): void;
  stop(): void;
  schedule(): void;
  flush(): void;
}

export function createAutosave(): Autosave {
  let getDoc: (() => CadDoc) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function save(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (getDoc) writeAutosave(getDoc());
  }
  function onVisibility(): void {
    if (document.visibilityState === "hidden") save();
  }

  return {
    start(gd) {
      getDoc = gd;
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

// ─── Named documents ─────────────────────────────────────────────────────────

export interface SavedDocEntry {
  name: string;
  savedAt: number;
}

interface DocStore {
  [name: string]: { savedAt: number; doc: CadDoc };
}

function readStore(): DocStore {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    return raw ? (JSON.parse(raw) as DocStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: DocStore): void {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function listSavedDocs(): SavedDocEntry[] {
  const store = readStore();
  return Object.entries(store)
    .map(([name, v]) => ({ name, savedAt: v.savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveNamedDoc(doc: CadDoc): void {
  const store = readStore();
  store[doc.name] = { savedAt: Date.now(), doc };
  writeStore(store);
}

export function loadNamedDoc(name: string): CadDoc | null {
  const store = readStore();
  return store[name]?.doc ?? null;
}

export function deleteNamedDoc(name: string): void {
  const store = readStore();
  delete store[name];
  writeStore(store);
}
