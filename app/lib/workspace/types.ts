/**
 * Provider-agnostic workspace types.
 *
 * The workspace can be backed by either a **local folder** (File System Access
 * API, Chromium-only) or **Google Drive**. To keep the sidebar, store and every
 * tool from caring which backend they're on, files and folders are addressed
 * through opaque references (`WsFileRef` / `WsDirRef`) instead of raw
 * `FileSystemFileHandle`s. Each provider knows how to read/write/mutate its own
 * refs (see `provider.ts`).
 */

export type WsSource = "local" | "drive";

// ── File refs ────────────────────────────────────────────────────────────────

export interface LocalFileRef {
  source: "local";
  name: string;
  /** Path relative to the workspace root, e.g. "src/index.ts". */
  path: string;
  handle: FileSystemFileHandle;
}

export interface DriveFileRef {
  source: "drive";
  name: string;
  path: string;
  fileId: string;
  mimeType: string;
  /** Drive `webViewLink` — used to open unsupported files in Google Drive. */
  webUrl?: string;
}

export type WsFileRef = LocalFileRef | DriveFileRef;

// ── Directory refs ───────────────────────────────────────────────────────────

export interface LocalDirRef {
  source: "local";
  name: string;
  path: string;
  handle: FileSystemDirectoryHandle;
}

export interface DriveDirRef {
  source: "drive";
  name: string;
  path: string;
  folderId: string;
}

export type WsDirRef = LocalDirRef | DriveDirRef;

// ── Tree ─────────────────────────────────────────────────────────────────────

export type WorkspaceEntry =
  | {
      kind: "file";
      name: string;
      path: string;
      ref: WsFileRef;
    }
  | {
      kind: "directory";
      name: string;
      path: string;
      ref: WsDirRef;
      children: WorkspaceEntry[];
    };
