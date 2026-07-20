/**
 * File System Access helpers for the **local** workspace provider.
 *
 * A local workspace lets a user pick a folder (`showDirectoryPicker`), lists its
 * files in the sidebar, and opens them in the matching tool with a live
 * `FileSystemFileHandle` (carried inside a `LocalFileRef`) so edits write
 * straight back to disk.
 *
 * This depends on the File System Access API, which is Chromium-only (Chrome,
 * Edge, Brave, Arc). Firefox and Safari expose none of `showDirectoryPicker` /
 * writable handles — see `supportsFileSystemAccess()`.
 */
import type { WorkspaceEntry, LocalDirRef } from "./types";

// The DOM lib types for the File System Access API are incomplete across TS
// versions, so we narrow through small local casts rather than pull a polyfill.
/* eslint-disable @typescript-eslint/no-explicit-any */

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

/** Build a `LocalDirRef` for the workspace root. */
export function rootDirRef(handle: FileSystemDirectoryHandle): LocalDirRef {
  return { source: "local", name: handle.name, path: "", handle };
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
      const dirHandle = handle as FileSystemDirectoryHandle;
      const children = await walk(dirHandle, path, depth + 1, counter);
      entries.push({
        kind: "directory",
        name,
        path,
        ref: { source: "local", name, path, handle: dirHandle },
        children,
      });
    } else {
      counter.n++;
      entries.push({
        kind: "file",
        name,
        path,
        ref: { source: "local", name, path, handle: handle as FileSystemFileHandle },
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

// ── Local file CRUD (used by the local provider) ─────────────────────────────

/** Create (or overwrite) a file `name` inside `dir` with optional content. */
export async function localCreateFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content?: Blob | string,
): Promise<FileSystemFileHandle> {
  const handle = await dir.getFileHandle(name, { create: true });
  if (content !== undefined) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }
  return handle;
}

/** Create a subfolder `name` inside `dir`. */
export async function localCreateDir(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return dir.getDirectoryHandle(name, { create: true });
}

/** Remove `name` (file or folder) from `dir`. */
export async function localRemove(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  await (dir as any).removeEntry(name, { recursive: true });
}

/**
 * Rename a file within `dir`. The FS Access API has no atomic rename, so we
 * copy the bytes to a new handle and delete the old one.
 */
export async function localRenameFile(
  dir: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<FileSystemFileHandle> {
  const src = await dir.getFileHandle(oldName);
  const bytes = await (await src.getFile()).arrayBuffer();
  const dest = await dir.getFileHandle(newName, { create: true });
  const writable = await dest.createWritable();
  await writable.write(bytes);
  await writable.close();
  await (dir as any).removeEntry(oldName);
  return dest;
}

export { MAX_DEPTH, MAX_ENTRIES, SKIP_DIRS };
