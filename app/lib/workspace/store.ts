/**
 * Reactive store for the workspace folder + the tool-handoff channel.
 *
 * Two concerns live here:
 *  1. The current folder (root handle, file tree, load status) — observed by the
 *     sidebar via `useWorkspace()`.
 *  2. A one-shot "pending open" handoff: when the user clicks a file the sidebar
 *     stashes its handle here, navigates to the tool route, and the tool
 *     consumes it on mount (`consumePendingOpen`).
 */
import { useSyncExternalStore } from "react";
import {
  clearPersistedRootHandle,
  loadPersistedRootHandle,
  persistRootHandle,
  pickDirectory,
  readDirectoryTree,
  supportsFileSystemAccess,
  verifyPermission,
  type WorkspaceEntry,
} from "./fs";
import type { ToolId } from "./routing";

export type WorkspaceStatus =
  | "idle" // no folder open
  | "loading" // reading the tree
  | "ready" // tree loaded
  | "denied" // permission refused
  | "error"; // something threw

export interface WorkspaceState {
  supported: boolean;
  status: WorkspaceStatus;
  rootName: string | null;
  tree: WorkspaceEntry[];
  error: string | null;
  /** Path of the file most recently opened, for sidebar highlighting. */
  activePath: string | null;
  /** Bumped whenever a new file is handed off, so a mounted tool re-consumes it. */
  pendingNonce: number;
}

let root: FileSystemDirectoryHandle | null = null;

let state: WorkspaceState = {
  supported: supportsFileSystemAccess(),
  status: "idle",
  rootName: null,
  tree: [],
  error: null,
  activePath: null,
  pendingNonce: 0,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(patch: Partial<WorkspaceState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): WorkspaceState {
  return state;
}

const serverSnapshot: WorkspaceState = {
  supported: false,
  status: "idle",
  rootName: null,
  tree: [],
  error: null,
  activePath: null,
  pendingNonce: 0,
};

function getServerSnapshot(): WorkspaceState {
  return serverSnapshot;
}

/** React hook — subscribe to the workspace state. */
export function useWorkspace(): WorkspaceState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ── Loading a folder ──────────────────────────────────────────────────────────

async function loadTree(handle: FileSystemDirectoryHandle) {
  root = handle;
  set({ status: "loading", rootName: handle.name, error: null });
  try {
    const tree = await readDirectoryTree(handle);
    set({ status: "ready", tree });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** Prompt for a folder, remember it, and list its files. */
export async function openFolder(): Promise<void> {
  if (!state.supported) return;
  const handle = await pickDirectory();
  if (!handle) return; // cancelled
  await persistRootHandle(handle).catch(() => {});
  await loadTree(handle);
}

/** Re-open the folder from a previous visit (re-requests permission). */
export async function reopenLastFolder(): Promise<boolean> {
  if (!state.supported) return false;
  const handle = await loadPersistedRootHandle();
  if (!handle) return false;
  const ok = await verifyPermission(handle, true);
  if (!ok) {
    set({ status: "denied", rootName: handle.name });
    return false;
  }
  await loadTree(handle);
  return true;
}

/** Whether a folder from a previous visit is available to re-open. */
export async function hasPersistedFolder(): Promise<boolean> {
  if (!state.supported) return false;
  return (await loadPersistedRootHandle()) !== null;
}

/** Re-read the current folder (after external changes / new files). */
export async function refreshFolder(): Promise<void> {
  if (root) await loadTree(root);
}

/** Close the folder and forget it. */
export async function closeFolder(): Promise<void> {
  root = null;
  await clearPersistedRootHandle().catch(() => {});
  set({ status: "idle", rootName: null, tree: [], error: null, activePath: null });
}

export function getRootHandle(): FileSystemDirectoryHandle | null {
  return root;
}

// ── Pending-open handoff ──────────────────────────────────────────────────────

export interface PendingOpen {
  tool: ToolId;
  name: string;
  handle: FileSystemFileHandle;
}

let pending: PendingOpen | null = null;

/** Stash a file for a tool to pick up after navigation. Bumps the nonce so an
 *  already-mounted tool (same route) re-consumes it. */
export function setPendingOpen(open: PendingOpen): void {
  pending = open;
  set({ pendingNonce: state.pendingNonce + 1 });
}

/**
 * Consume a pending open if it targets `tool`. Returns null otherwise, leaving
 * any handoff meant for a different tool in place.
 */
export function consumePendingOpen(tool: ToolId): PendingOpen | null {
  if (pending && pending.tool === tool) {
    const p = pending;
    pending = null;
    return p;
  }
  return null;
}

/** Mark a path as the active/open file (sidebar highlight). */
export function setActivePath(path: string | null): void {
  set({ activePath: path });
}
