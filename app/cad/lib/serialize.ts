/**
 * Document (de)serialisation for the CAD tool:
 *   - {@link docToJson}/{@link docFromJson} — the native persistence format.
 *   - {@link encodeShare}/{@link decodeShare} — compact, URL-safe payload for
 *     share-by-URL (`/cad#doc=…`).
 */
import type { CadDoc, CadScene } from "./types";

export const SCENE_VERSION = 1;

export function docToJson(doc: CadDoc): string {
  return JSON.stringify({ version: SCENE_VERSION, doc } satisfies CadScene);
}

export function docFromJson(raw: string): CadDoc | null {
  try {
    const parsed = JSON.parse(raw) as CadScene;
    if (!parsed || typeof parsed !== "object") return null;
    const doc = parsed.doc;
    if (!doc || !Array.isArray(doc.features)) return null;
    return { name: typeof doc.name === "string" ? doc.name : "Untitled", features: doc.features };
  } catch {
    return null;
  }
}

// ─── Share-by-URL ────────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeShare(doc: CadDoc): string {
  const json = docToJson(doc);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeShare(payload: string): CadDoc | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(payload));
    return docFromJson(json);
  } catch {
    return null;
  }
}

/** Read a shared document from `location.hash` (`#doc=…`), if present. */
export function readShareFromHash(hash: string): CadDoc | null {
  const m = /[#&]doc=([^&]+)/.exec(hash);
  if (!m) return null;
  return decodeShare(m[1]);
}
