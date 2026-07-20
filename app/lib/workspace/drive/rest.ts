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

/** Throw an Error carrying the Drive API's own reason (from the JSON body). */
async function fail(res: Response, what: string): Promise<never> {
  let reason = "";
  try {
    const body = await res.json();
    reason = body?.error?.message || body?.error?.errors?.[0]?.message || "";
  } catch {
    /* non-JSON body */
  }
  throw new Error(`${what} (${res.status})${reason ? `: ${reason}` : ""}`);
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
    if (!res.ok) await fail(res, "Drive list failed");
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
  if (!res.ok) await fail(res, "Drive download failed");
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
  if (!res.ok) await fail(res, "Drive save failed");
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
  if (!res.ok) await fail(res, "Drive create failed");
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
  if (!res.ok) await fail(res, "Drive folder create failed");
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
  if (!res.ok) await fail(res, "Drive rename failed");
  return (await res.json()) as DriveFileMeta;
}

export async function deleteFile(fileId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/files/${fileId}?supportsAllDrives=true`,
    { method: "DELETE", headers },
  );
  // 204 No Content on success.
  if (!res.ok && res.status !== 204) await fail(res, "Drive delete failed");
}
