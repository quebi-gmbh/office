/**
 * Reactive store for the workspace (local folder or Google Drive) plus the
 * tool-handoff channel.
 *
 * Two concerns live here:
 *  1. The current workspace (root ref, file tree, load status, source) — observed
 *     by the sidebar via `useWorkspace()`.
 *  2. A one-shot "pending open" handoff: when the user clicks a file the sidebar
 *     stashes its ref here, navigates to the tool route, and the tool consumes it
 *     on mount (`consumePendingOpen`).
 *
 * All backend specifics go through `WorkspaceProvider` (see `provider.ts`); this
 * store is source-agnostic.
 */
import { useSyncExternalStore } from "react";
import { driveConfigured } from "./drive/config";
import {
  clearPersistedWorkspace,
  loadPersistedWorkspace,
  persistWorkspace,
  type PersistedWorkspace,
} from "./persist";
import { getProvider } from "./provider";
import { supportsFileSystemAccess } from "./fs";
import type { ToolId } from "./routing";
import type {
  DriveFileRef,
  WorkspaceEntry,
  WsDirRef,
  WsFileRef,
  WsSource,
} from "./types";

export type WorkspaceStatus =
  | "idle" // no folder open
  | "loading" // reading the tree
  | "ready" // tree loaded
  | "denied" // permission refused
  | "error"; // something threw

export interface WorkspaceState {
  /** Any backend usable at all (local supported OR Drive configured). */
  supported: boolean;
  localSupported: boolean;
  driveSupported: boolean;
  status: WorkspaceStatus;
  source: WsSource | null;
  rootName: string | null;
  tree: WorkspaceEntry[];
  error: string | null;
  /** Path of the file most recently opened, for sidebar highlighting. */
  activePath: string | null;
  /** Bumped whenever a new file is handed off, so a mounted tool re-consumes it. */
  pendingNonce: number;
}

let root: WsDirRef | null = null;

const localSupported = supportsFileSystemAccess();
const driveSupported = driveConfigured();

let state: WorkspaceState = {
  supported: localSupported || driveSupported,
  localSupported,
  driveSupported,
  status: "idle",
  source: null,
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
  localSupported: false,
  driveSupported: false,
  status: "idle",
  source: null,
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

// ── Loading a workspace ────────────────────────────────────────────────────────

// Files the user has explicitly added to a Drive workspace via the Picker (or
// created in-app). Under the drive.file scope, a folder's pre-existing files
// don't enumerate, so we track granted files here and merge them into the tree.
const driveAdded = new Map<string, DriveFileRef>();

function collectDriveIds(entries: WorkspaceEntry[], into: Set<string>): void {
  for (const e of entries) {
    if (e.kind === "file" && e.ref.source === "drive") into.add(e.ref.fileId);
    else if (e.kind === "directory") collectDriveIds(e.children, into);
  }
}

async function loadTree(rootRef: WsDirRef) {
  root = rootRef;
  set({
    status: "loading",
    source: rootRef.source,
    rootName: rootRef.name,
    error: null,
  });
  try {
    const provider = await getProvider(rootRef.source);
    let tree = await provider.listTree(rootRef);
    if (rootRef.source === "drive" && driveAdded.size) {
      const present = new Set<string>();
      collectDriveIds(tree, present);
      const extra: WorkspaceEntry[] = [];
      for (const ref of driveAdded.values()) {
        if (!present.has(ref.fileId)) {
          extra.push({ kind: "file", name: ref.name, path: ref.path, ref });
        }
      }
      tree = [...extra, ...tree];
    }
    set({ status: "ready", tree });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

function toPersisted(rootRef: WsDirRef): PersistedWorkspace {
  return rootRef.source === "local"
    ? { source: "local", handle: rootRef.handle }
    : { source: "drive", folderId: rootRef.folderId, name: rootRef.name };
}

/** Prompt for a workspace from `source`, remember it, and list its files. */
export async function openWorkspace(source: WsSource): Promise<void> {
  const provider = await getProvider(source);
  if (!provider.supported()) return;
  const rootRef = await provider.pickRoot();
  if (!rootRef) return; // cancelled
  await persistWorkspace(toPersisted(rootRef)).catch(() => {});
  await loadTree(rootRef);
}

/** Re-open the workspace from a previous visit (re-auth / re-permission). */
export async function reopenLastWorkspace(): Promise<boolean> {
  const p = await loadPersistedWorkspace();
  if (!p) return false;
  const provider = await getProvider(p.source);
  if (!provider.supported()) return false;
  const rootRef = await provider.reopen(p);
  if (!rootRef) {
    set({ status: "denied", source: p.source, rootName: persistedName(p) });
    return false;
  }
  await loadTree(rootRef);
  return true;
}

function persistedName(p: PersistedWorkspace): string {
  return p.source === "local" ? p.handle.name : p.name;
}

/** Whether a workspace from a previous visit is available to re-open. */
export async function hasPersistedWorkspace(): Promise<boolean> {
  return (await loadPersistedWorkspace()) !== null;
}

/** Re-read the current workspace (after external changes / new files / CRUD). */
export async function refreshWorkspace(): Promise<void> {
  if (root) await loadTree(root);
}

/** Add existing Drive files to the workspace via the Picker (drive.file grant). */
export async function addDriveFiles(): Promise<void> {
  if (!root || root.source !== "drive") return;
  const { pickFiles } = await import("./drive/picker");
  const picked = await pickFiles(root.folderId);
  for (const f of picked) {
    driveAdded.set(f.id, {
      source: "drive",
      name: f.name,
      path: f.name,
      fileId: f.id,
      mimeType: f.mimeType,
      webUrl: f.url,
    });
  }
  if (picked.length) await refreshWorkspace();
}

/** Close the workspace and forget it. */
export async function closeWorkspace(): Promise<void> {
  root = null;
  driveAdded.clear();
  await clearPersistedWorkspace().catch(() => {});
  set({
    status: "idle",
    source: null,
    rootName: null,
    tree: [],
    error: null,
    activePath: null,
  });
}

export function getRoot(): WsDirRef | null {
  return root;
}

// ── File CRUD ──────────────────────────────────────────────────────────────────

export async function createFileIn(
  parent: WsDirRef,
  name: string,
  content?: Blob | string,
): Promise<WsFileRef> {
  const provider = await getProvider(parent.source);
  const ref = await provider.createFile(parent, name, content);
  if (ref.source === "drive") driveAdded.set(ref.fileId, ref);
  await refreshWorkspace();
  return ref;
}

export async function createDirIn(
  parent: WsDirRef,
  name: string,
): Promise<WsDirRef> {
  const provider = await getProvider(parent.source);
  const ref = await provider.createDir(parent, name);
  await refreshWorkspace();
  return ref;
}

export async function renameEntry(
  parent: WsDirRef,
  ref: WsFileRef,
  newName: string,
): Promise<void> {
  const provider = await getProvider(parent.source);
  await provider.rename(parent, ref, newName);
  await refreshWorkspace();
}

export async function removeEntry(
  parent: WsDirRef,
  ref: WsFileRef | WsDirRef,
): Promise<void> {
  const provider = await getProvider(parent.source);
  await provider.remove(parent, ref);
  await refreshWorkspace();
}

// ── Pending-open handoff ──────────────────────────────────────────────────────

export interface PendingOpen {
  tool: ToolId;
  ref: WsFileRef;
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
