/**
 * Local workspace provider — File System Access API.
 *
 * Wraps the helpers in `fs.ts` behind the `WorkspaceProvider` interface. All
 * refs it produces/consumes are `source: "local"` and carry live
 * `FileSystem*Handle`s.
 */
import {
  localCreateDir,
  localCreateFile,
  localRemove,
  localRenameFile,
  pickDirectory,
  readDirectoryTree,
  rootDirRef,
  supportsFileSystemAccess,
  verifyPermission,
} from "./fs";
import type { PersistedWorkspace } from "./persist";
import type { WorkspaceProvider } from "./provider";
import type {
  LocalDirRef,
  LocalFileRef,
  WorkspaceEntry,
  WsDirRef,
  WsFileRef,
} from "./types";

function asLocalDir(ref: WsDirRef): LocalDirRef {
  if (ref.source !== "local") throw new Error("Expected a local directory ref");
  return ref;
}
function asLocalFile(ref: WsFileRef): LocalFileRef {
  if (ref.source !== "local") throw new Error("Expected a local file ref");
  return ref;
}

function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

export const localProvider: WorkspaceProvider = {
  source: "local",

  supported() {
    return supportsFileSystemAccess();
  },

  async pickRoot(): Promise<WsDirRef | null> {
    const handle = await pickDirectory();
    return handle ? rootDirRef(handle) : null;
  },

  async reopen(p: PersistedWorkspace): Promise<WsDirRef | null> {
    if (p.source !== "local") return null;
    const ok = await verifyPermission(p.handle, true);
    if (!ok) return null;
    return rootDirRef(p.handle);
  },

  listTree(root: WsDirRef): Promise<WorkspaceEntry[]> {
    return readDirectoryTree(asLocalDir(root).handle);
  },

  async readFile(ref: WsFileRef): Promise<File> {
    return asLocalFile(ref).handle.getFile();
  },

  async writeText(ref: WsFileRef, text: string): Promise<void> {
    const writable = await asLocalFile(ref).handle.createWritable();
    await writable.write(text);
    await writable.close();
  },

  async writeBlob(ref: WsFileRef, blob: Blob): Promise<void> {
    const writable = await asLocalFile(ref).handle.createWritable();
    await writable.write(blob);
    await writable.close();
  },

  async createFile(
    parent: WsDirRef,
    name: string,
    content?: Blob | string,
  ): Promise<WsFileRef> {
    const dir = asLocalDir(parent);
    const handle = await localCreateFile(dir.handle, name, content);
    return { source: "local", name, path: joinPath(dir.path, name), handle };
  },

  async createDir(parent: WsDirRef, name: string): Promise<WsDirRef> {
    const dir = asLocalDir(parent);
    const handle = await localCreateDir(dir.handle, name);
    return { source: "local", name, path: joinPath(dir.path, name), handle };
  },

  async rename(
    parent: WsDirRef,
    ref: WsFileRef,
    newName: string,
  ): Promise<WsFileRef> {
    const dir = asLocalDir(parent);
    const file = asLocalFile(ref);
    const handle = await localRenameFile(dir.handle, file.name, newName);
    return {
      source: "local",
      name: newName,
      path: joinPath(dir.path, newName),
      handle,
    };
  },

  async remove(parent: WsDirRef, ref: WsFileRef | WsDirRef): Promise<void> {
    const dir = asLocalDir(parent);
    await localRemove(dir.handle, ref.name);
  },
};
