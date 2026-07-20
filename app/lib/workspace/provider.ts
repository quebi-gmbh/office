/**
 * The `WorkspaceProvider` abstraction.
 *
 * A provider knows how to pick a root folder, list its tree, and read / write /
 * mutate files addressed by its own refs. Two implementations exist:
 *  - `localProvider`  — File System Access API (Chromium-only).
 *  - `driveProvider`  — Google Drive (loaded lazily so the Google client code
 *                       never ships in the bundle unless Drive is used).
 *
 * Tools and the sidebar go through the source-dispatching helpers at the bottom
 * (`readFile` / `writeText` / `writeBlob` / …) and never import a provider
 * directly.
 */
import type { PersistedWorkspace } from "./persist";
import type { WorkspaceEntry, WsDirRef, WsFileRef, WsSource } from "./types";

export interface WorkspaceProvider {
  source: WsSource;
  /** True when this backend can be used in the current browser/config. */
  supported(): boolean;
  /** Prompt the user to choose a root folder. Null if cancelled. */
  pickRoot(): Promise<WsDirRef | null>;
  /** Re-open a root remembered from a previous visit. Null if unavailable. */
  reopen(p: PersistedWorkspace): Promise<WsDirRef | null>;
  listTree(root: WsDirRef): Promise<WorkspaceEntry[]>;
  readFile(ref: WsFileRef): Promise<File>;
  writeText(ref: WsFileRef, text: string): Promise<void>;
  writeBlob(ref: WsFileRef, blob: Blob): Promise<void>;
  createFile(
    parent: WsDirRef,
    name: string,
    content?: Blob | string,
  ): Promise<WsFileRef>;
  createDir(parent: WsDirRef, name: string): Promise<WsDirRef>;
  /** Rename `ref` (a child of `parent`) to `newName`. */
  rename(parent: WsDirRef, ref: WsFileRef, newName: string): Promise<WsFileRef>;
  /** Remove `ref` (a child of `parent`). */
  remove(parent: WsDirRef, ref: WsFileRef | WsDirRef): Promise<void>;
}

import { localProvider } from "./local-provider";

let driveP: WorkspaceProvider | null = null;

/** Resolve a provider by source, lazily loading the Drive module on first use. */
export async function getProvider(source: WsSource): Promise<WorkspaceProvider> {
  if (source === "local") return localProvider;
  if (!driveP) {
    driveP = (await import("./drive/drive-provider")).driveProvider;
  }
  return driveP;
}

// ── Source-dispatching helpers (the tool-facing API) ─────────────────────────

export async function readFile(ref: WsFileRef): Promise<File> {
  return (await getProvider(ref.source)).readFile(ref);
}

export async function writeText(ref: WsFileRef, text: string): Promise<void> {
  return (await getProvider(ref.source)).writeText(ref, text);
}

export async function writeBlob(ref: WsFileRef, blob: Blob): Promise<void> {
  return (await getProvider(ref.source)).writeBlob(ref, blob);
}
