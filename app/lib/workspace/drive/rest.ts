/**
 * Thin Drive REST v3 wrappers (client-side, Bearer token from `auth.ts`).
 * Only the operations the workspace needs: list, download, upload, create,
 * rename, delete.
 */
import { getAccessToken } from "./auth";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Google-native docs (Docs/Sheets/Slides) have no downloadable bytes. */
export function isNativeGoogleDoc(mimeType: string): boolean {
  return (
    mimeType.startsWith("application/vnd.google-apps.") &&
    mimeType !== FOLDER_MIME
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

const META_FIELDS = "id,name,mimeType,webViewLink";

/** List direct children of a folder (paginated), folders first then by name. */
export async function listChildren(folderId: string): Promise<DriveFileMeta[]> {
  const headers = await authHeaders();
  const out: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: `nextPageToken,files(${META_FIELDS})`,
      pageSize: "1000",
      orderBy: "folder,name_natural",
      spaces: "drive",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${API}/files?${params.toString()}`, { headers });
    if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
    const json = await res.json();
    out.push(...((json.files as DriveFileMeta[]) ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export async function getFileBlob(fileId: string): Promise<Blob> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers },
  );
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  return res.blob();
}

export async function updateFileMedia(
  fileId: string,
  body: Blob,
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${UPLOAD}/files/${fileId}?uploadType=media&supportsAllDrives=true`,
    { method: "PATCH", headers, body },
  );
  if (!res.ok) throw new Error(`Drive save failed (${res.status})`);
}

/** Create a file's metadata (optionally then upload its content). */
export async function createFile(
  parentId: string,
  name: string,
  content?: Blob | string,
): Promise<DriveFileMeta> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/files?fields=${META_FIELDS}&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId] }),
    },
  );
  if (!res.ok) throw new Error(`Drive create failed (${res.status})`);
  const meta = (await res.json()) as DriveFileMeta;
  if (content !== undefined) {
    const blob =
      typeof content === "string"
        ? new Blob([content], { type: "text/plain" })
        : content;
    await updateFileMedia(meta.id, blob);
  }
  return meta;
}

export async function createFolder(
  parentId: string,
  name: string,
): Promise<DriveFileMeta> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/files?fields=${META_FIELDS}&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId], mimeType: FOLDER_MIME }),
    },
  );
  if (!res.ok) throw new Error(`Drive folder create failed (${res.status})`);
  return (await res.json()) as DriveFileMeta;
}

export async function renameFile(
  fileId: string,
  name: string,
): Promise<DriveFileMeta> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/files/${fileId}?fields=${META_FIELDS}&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) throw new Error(`Drive rename failed (${res.status})`);
  return (await res.json()) as DriveFileMeta;
}

export async function deleteFile(fileId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/files/${fileId}?supportsAllDrives=true`,
    { method: "DELETE", headers },
  );
  // 204 No Content on success.
  if (!res.ok && res.status !== 204) {
    throw new Error(`Drive delete failed (${res.status})`);
  }
}
