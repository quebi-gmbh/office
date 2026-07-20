/**
 * Remembering the last-opened workspace across reloads.
 *
 * A local `FileSystemDirectoryHandle` is structured-cloneable, so it lives in
 * IndexedDB directly (permission is re-requested on the next visit). A Drive
 * workspace only needs its folder id + name; the OAuth token is re-acquired.
 */
import { openStore } from "../../paint/io/idb";

export type PersistedWorkspace =
  | { source: "local"; handle: FileSystemDirectoryHandle }
  | { source: "drive"; folderId: string; name: string };

const WS_DB = "office-workspace";
const WS_STORE = "handles";
const ROOT_KEY = "root";

export async function persistWorkspace(p: PersistedWorkspace): Promise<void> {
  const store = await openStore(WS_DB, WS_STORE);
  await store.put(ROOT_KEY, p);
}

export async function loadPersistedWorkspace(): Promise<PersistedWorkspace | null> {
  const store = await openStore(WS_DB, WS_STORE);
  return store.get<PersistedWorkspace>(ROOT_KEY);
}

export async function clearPersistedWorkspace(): Promise<void> {
  const store = await openStore(WS_DB, WS_STORE);
  await store.delete(ROOT_KEY);
}
