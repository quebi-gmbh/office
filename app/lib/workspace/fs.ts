/**
 * File System Access helpers for the workspace feature.
 *
 * The workspace lets a user pick a local folder (`showDirectoryPicker`), lists
 * its files in a sidebar, and opens them in the matching tool with a live
 * `FileSystemFileHandle` so edits can be written straight back to disk.
 *
 * This whole feature depends on the File System Access API, which is
 * Chromium-only (Chrome, Edge, Brave, Arc). Firefox and Safari expose none of
 * `showDirectoryPicker` / writable handles, so the sidebar hides itself there —
 * see `supportsFileSystemAccess()`.
 */
import { openStore } from "../../paint/io/idb";

// The DOM lib types for the File System Access API are incomplete across TS
// versions, so we narrow through small local casts rather than pull a polyfill.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type WorkspaceEntry =
  | {
      kind: "file";
      name: string;
      /** Path relative to the workspace root, e.g. "src/index.ts". */
      path: string;
      handle: FileSystemFileHandle;
    }
  | {
      kind: "directory";
      name: string;
      path: string;
      children: WorkspaceEntry[];
    };

/** True when the current browser supports picking a directory + writable handles. */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).showDirectoryPicker === "function"
  );
}

// Directories we never descend into — noise that would bloat the tree.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".cache",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".DS_Store",
]);

const MAX_DEPTH = 6;
const MAX_ENTRIES = 5000;

/** Prompt the user to pick a folder. Returns null if they cancel. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as any).showDirectoryPicker as
    | ((opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>)
    | undefined;
  if (!picker) return null;
  try {
    return await picker({ mode: "readwrite" });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/**
 * Ensure we hold a permission grant for `handle`. Queries first, then requests
 * (which needs a user gesture). Returns false if denied.
 */
export async function verifyPermission(
  handle: FileSystemHandle,
  readWrite: boolean,
): Promise<boolean> {
  const opts: any = readWrite ? { mode: "readwrite" } : { mode: "read" };
  const h = handle as any;
  if (typeof h.queryPermission === "function") {
    if ((await h.queryPermission(opts)) === "granted") return true;
  }
  if (typeof h.requestPermission === "function") {
    if ((await h.requestPermission(opts)) === "granted") return true;
    return false;
  }
  // No permission API (older impls) — assume granted.
  return true;
}

/** Recursively build a sorted tree of the folder's contents. */
export async function readDirectoryTree(
  dir: FileSystemDirectoryHandle,
): Promise<WorkspaceEntry[]> {
  const counter = { n: 0 };
  return walk(dir, "", 0, counter);
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  counter: { n: number },
): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];
  // `entries()` is an async iterator not always present in TS's lib types.
  const iter = (dir as any).entries?.() ?? (dir as any).values?.();
  if (!iter) return entries;

  for await (const item of iter) {
    if (counter.n >= MAX_ENTRIES) break;
    // entries() yields [name, handle]; values() yields handle.
    const handle: FileSystemHandle = Array.isArray(item) ? item[1] : item;
    const name = handle.name;
    if (name.startsWith(".")) continue;
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === "directory") {
      if (SKIP_DIRS.has(name) || depth >= MAX_DEPTH) continue;
      counter.n++;
      const children = await walk(
        handle as FileSystemDirectoryHandle,
        path,
        depth + 1,
        counter,
      );
      entries.push({ kind: "directory", name, path, children });
    } else {
      counter.n++;
      entries.push({
        kind: "file",
        name,
        path,
        handle: handle as FileSystemFileHandle,
      });
    }
  }

  entries.sort(sortEntries);
  return entries;
}

/** Directories first, then files, each alphabetical (case-insensitive). */
function sortEntries(a: WorkspaceEntry, b: WorkspaceEntry): number {
  if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

// ── Persisting the root handle across reloads ─────────────────────────────────
//
// A FileSystemDirectoryHandle is structured-cloneable, so it can live in
// IndexedDB. On the next visit we re-request permission (needs a click) and
// re-list the folder.

const WS_DB = "office-workspace";
const WS_STORE = "handles";
const ROOT_KEY = "root";

export async function persistRootHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const store = await openStore(WS_DB, WS_STORE);
  await store.put(ROOT_KEY, handle);
}

export async function loadPersistedRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  const store = await openStore(WS_DB, WS_STORE);
  return store.get<FileSystemDirectoryHandle>(ROOT_KEY);
}

export async function clearPersistedRootHandle(): Promise<void> {
  const store = await openStore(WS_DB, WS_STORE);
  await store.delete(ROOT_KEY);
}
