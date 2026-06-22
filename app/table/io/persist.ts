/**
 * Per-document autosave to IndexedDB with a ~1 s debounce.
 *
 * Reuses the tiny IDB Promise wrapper from `/paint` (one DB, one store). The
 * whole `TableDoc` is JSON-serialisable (plain string arrays), so we store it
 * directly. A single "current" key holds the working doc; phase 2.5 adds
 * version history and a recent-files drawer on top of the same store.
 */
import { openStore } from "~/paint/io/idb";
import type { TableDoc } from "~/table/lib/model";

const DB_NAME = "office-table";
const STORE_NAME = "documents";
const CURRENT_KEY = "current";
const DEBOUNCE_MS = 1000;

export interface TableAutosave {
  version: 1;
  savedAt: number;
  doc: TableDoc;
}

let storePromise: ReturnType<typeof openStore> | null = null;
function store() {
  return (storePromise ??= openStore(DB_NAME, STORE_NAME));
}

export async function loadDoc(): Promise<TableDoc | null> {
  const s = await store();
  if (!s.available) return null;
  const rec = await s.get<TableAutosave>(CURRENT_KEY);
  return rec?.doc ?? null;
}

export async function saveDocNow(doc: TableDoc): Promise<void> {
  const s = await store();
  if (!s.available) return;
  const rec: TableAutosave = { version: 1, savedAt: Date.now(), doc };
  await s.put(CURRENT_KEY, rec);
}

export interface Autosaver {
  /** Schedule a debounced save of the latest doc. */
  schedule(doc: TableDoc): void;
  /** Save immediately (used on tab-hide / unmount). */
  flush(): void;
  stop(): void;
}

export function createAutosaver(onSaved?: (at: number) => void): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TableDoc | null = null;

  async function doSave() {
    if (!pending) return;
    const doc = pending;
    pending = null;
    await saveDocNow(doc);
    onSaved?.(Date.now());
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      if (timer) clearTimeout(timer);
      void doSave();
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  return {
    schedule(doc) {
      pending = doc;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void doSave();
      }, DEBOUNCE_MS);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void doSave();
    },
    stop() {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    },
  };
}
