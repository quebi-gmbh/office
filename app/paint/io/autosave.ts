/**
 * Autosave — persists the current canvas state to IndexedDB every 5 s while idle,
 * and immediately on visibilitychange (tab hidden / window closing).
 *
 * Schema (stored under key = sessionId):
 *   PaintAutosave v1 — png Blob + metadata.
 *
 * Usage:
 *   const autosave = createAutosave(store);
 *   autosave.start(getCanvas, getState);
 *   autosave.stop();
 *   autosave.pointerActivity(); // call from pointer events to reset idle timer
 *
 * Session ID:
 *   Stored in localStorage under 'office:paint:session'.
 *   Rotated on newDocument (so the old session survives as a backup).
 *
 * NOTE: The autosave key is localStorage-stored but the actual data is in IDB.
 *   This allows restoring across tabs.
 */
import { openStore } from "~/paint/io/idb";
import type { EngineState } from "~/paint/lib/types";

const SESSION_KEY = "office:paint:session";
const DB_NAME = "office-paint";
const STORE_NAME = "documents";
const IDLE_MS = 5000;

export interface PaintAutosave {
  sessionId: string;
  version: 1;
  savedAt: number;
  doc: { width: number; height: number; bgWasTransparent: boolean };
  png: Blob;
  fg: string;
  bg: string;
}

export interface AutosaveSession {
  sessionId: string;
  lastSavedAt: number;
}

export function loadSession(): AutosaveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutosaveSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AutosaveSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function rotateSession(): string {
  const id = crypto.randomUUID();
  saveSession({ sessionId: id, lastSavedAt: Date.now() });
  return id;
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export interface Autosave {
  start(
    getCanvas: () => HTMLCanvasElement | null,
    getState: () => EngineState,
    isDragging: () => boolean,
  ): void;
  stop(): void;
  pointerActivity(): void;
  /** Save immediately (used on visibilitychange or explicit trigger). */
  flush(): void;
  available: boolean;
}

export function createAutosave(): Autosave {
  let storePromise: ReturnType<typeof openStore> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let getCanvas: (() => HTMLCanvasElement | null) | null = null;
  let getState: (() => EngineState) | null = null;
  let isDragging: (() => boolean) | null = null;
  let available = true;
  let lastActivity = Date.now();

  async function doSave(): Promise<void> {
    if (!getCanvas || !getState || !isDragging) return;
    if (isDragging()) return; // Don't save mid-stroke.

    const canvas = getCanvas();
    if (!canvas) return;

    const state = getState();
    const session = loadSession();
    if (!session) return;

    const store = await (storePromise ??= openStore(DB_NAME, STORE_NAME));
    if (!store.available) {
      available = false;
      return;
    }

    const png = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/png"),
    );
    if (!png) return;

    const record: PaintAutosave = {
      sessionId: session.sessionId,
      version: 1,
      savedAt: Date.now(),
      doc: state.doc,
      png,
      fg: state.fg,
      bg: state.bg,
    };

    await store.put(session.sessionId, record);
    saveSession({ ...session, lastSavedAt: record.savedAt });
  }

  function scheduleIdle(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const idle = Date.now() - lastActivity;
      if (idle >= IDLE_MS) {
        doSave();
      }
      scheduleIdle();
    }, IDLE_MS);
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") doSave();
  }

  return {
    get available() { return available; },

    start(gc, gs, id) {
      getCanvas = gc;
      getState = gs;
      isDragging = id;
      scheduleIdle();
      document.addEventListener("visibilitychange", onVisibilityChange);
    },

    stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },

    pointerActivity() {
      lastActivity = Date.now();
    },

    flush() {
      doSave();
    },
  };
}

/** Load a saved session from IndexedDB. Returns null if not found or IDB unavailable. */
export async function loadAutosave(sessionId: string): Promise<PaintAutosave | null> {
  const store = await openStore(DB_NAME, STORE_NAME);
  if (!store.available) return null;
  return store.get<PaintAutosave>(sessionId);
}

/** Clear all autosave data from IDB + localStorage. */
export async function clearAllAutosaveData(): Promise<void> {
  clearSession();
  const store = await openStore(DB_NAME, STORE_NAME);
  if (!store.available) return;
  const session = loadSession();
  if (session) await store.delete(session.sessionId);
}
