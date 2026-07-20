/**
 * Google Drive workspace provider.
 *
 * Auth via GIS (see `auth.ts`), root selection via the Google Picker
 * (`picker.ts`), and file ops via Drive REST (`rest.ts`). Uses the folder-scoped
 * `drive.file` grant, so it only ever sees the folder the user picked and its
 * descendants. Loaded lazily by `getProvider("drive")`.
 */
import { driveConfigured } from "./config";
import { pickFolder } from "./picker";
import {
  createFile as restCreateFile,
  createFolder as restCreateFolder,
  deleteFile,
  FOLDER_MIME,
  getFileBlob,
  isNativeGoogleDoc,
  listChildren,
  renameFile,
  updateFileMedia,
  type DriveFileMeta,
} from "./rest";
import { clearToken } from "./auth";
import type { PersistedWorkspace } from "../persist";
import type { WorkspaceProvider } from "../provider";
import type {
  DriveDirRef,
  DriveFileRef,
  WorkspaceEntry,
  WsDirRef,
  WsFileRef,
} from "../types";

const MAX_DEPTH = 6;
const MAX_ENTRIES = 5000;

function asDriveDir(ref: WsDirRef): DriveDirRef {
  if (ref.source !== "drive") throw new Error("Expected a Drive directory ref");
  return ref;
}
function asDriveFile(ref: WsFileRef): DriveFileRef {
  if (ref.source !== "drive") throw new Error("Expected a Drive file ref");
  return ref;
}

function join(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

function fileRef(meta: DriveFileMeta, path: string): DriveFileRef {
  return {
    source: "drive",
    name: meta.name,
    path,
    fileId: meta.id,
    mimeType: meta.mimeType,
    webUrl: meta.webViewLink,
  };
}

async function walk(
  folderId: string,
  prefix: string,
  depth: number,
  counter: { n: number },
): Promise<WorkspaceEntry[]> {
  const children = await listChildren(folderId);
  const entries: WorkspaceEntry[] = [];
  for (const meta of children) {
    if (counter.n >= MAX_ENTRIES) break;
    const path = join(prefix, meta.name);
    if (meta.mimeType === FOLDER_MIME) {
      counter.n++;
      const sub = depth < MAX_DEPTH ? await walk(meta.id, path, depth + 1, counter) : [];
      entries.push({
        kind: "directory",
        name: meta.name,
        path,
        ref: { source: "drive", name: meta.name, path, folderId: meta.id },
        children: sub,
      });
    } else {
      counter.n++;
      entries.push({ kind: "file", name: meta.name, path, ref: fileRef(meta, path) });
    }
  }
  return entries;
}

export const driveProvider: WorkspaceProvider = {
  source: "drive",

  supported() {
    return driveConfigured();
  },

  async pickRoot(): Promise<WsDirRef | null> {
    const folder = await pickFolder();
    if (!folder) return null;
    return { source: "drive", name: folder.name, path: "", folderId: folder.id };
  },

  async reopen(p: PersistedWorkspace): Promise<WsDirRef | null> {
    if (p.source !== "drive") return null;
    return { source: "drive", name: p.name, path: "", folderId: p.folderId };
  },

  async listTree(root: WsDirRef): Promise<WorkspaceEntry[]> {
    const dir = asDriveDir(root);
    return walk(dir.folderId, "", 0, { n: 0 });
  },

  async readFile(ref: WsFileRef): Promise<File> {
    const file = asDriveFile(ref);
    if (isNativeGoogleDoc(file.mimeType)) {
      throw new Error(
        "Google Docs/Sheets/Slides can't be edited here — open them in Google Drive.",
      );
    }
    const blob = await getFileBlob(file.fileId);
    return new File([blob], file.name, { type: file.mimeType });
  },

  async writeText(ref: WsFileRef, text: string): Promise<void> {
    const file = asDriveFile(ref);
    await updateFileMedia(
      file.fileId,
      new Blob([text], { type: file.mimeType || "text/plain" }),
    );
  },

  async writeBlob(ref: WsFileRef, blob: Blob): Promise<void> {
    await updateFileMedia(asDriveFile(ref).fileId, blob);
  },

  async createFile(
    parent: WsDirRef,
    name: string,
    content?: Blob | string,
  ): Promise<WsFileRef> {
    const dir = asDriveDir(parent);
    const meta = await restCreateFile(dir.folderId, name, content);
    return fileRef(meta, join(dir.path, name));
  },

  async createDir(parent: WsDirRef, name: string): Promise<WsDirRef> {
    const dir = asDriveDir(parent);
    const meta = await restCreateFolder(dir.folderId, name);
    return { source: "drive", name: meta.name, path: join(dir.path, name), folderId: meta.id };
  },

  async rename(
    parent: WsDirRef,
    ref: WsFileRef,
    newName: string,
  ): Promise<WsFileRef> {
    const dir = asDriveDir(parent);
    const file = asDriveFile(ref);
    const meta = await renameFile(file.fileId, newName);
    return fileRef(meta, join(dir.path, newName));
  },

  async remove(_parent: WsDirRef, ref: WsFileRef | WsDirRef): Promise<void> {
    if (ref.source !== "drive") throw new Error("Expected a Drive ref");
    const id = "fileId" in ref ? ref.fileId : ref.folderId;
    await deleteFile(id);
  },
};

/** Clear cached auth (used when closing a Drive workspace). */
export { clearToken as clearDriveAuth };
