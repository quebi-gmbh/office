/**
 * Share-by-URL — encode the whole scene into the location hash so a drawing can
 * be shared as a self-contained link (no server involved). The scene JSON is
 * UTF-8 → base64url encoded under the `#s=` fragment.
 */
import { sceneFromJson, sceneToJson } from "~/vector/lib/serialize";
import type { VectorScene } from "~/vector/lib/types";

const PREFIX = "s=";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSceneToHash(scene: VectorScene): string {
  const bytes = new TextEncoder().encode(sceneToJson(scene));
  return `#${PREFIX}${toBase64Url(bytes)}`;
}

export function decodeSceneFromHash(hash: string): VectorScene | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith(PREFIX)) return null;
  try {
    const bytes = fromBase64Url(raw.slice(PREFIX.length));
    return sceneFromJson(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Full shareable URL for the current page + scene. */
export function buildShareUrl(scene: VectorScene): string {
  const base = typeof location !== "undefined" ? location.origin + location.pathname + location.search : "";
  return base + encodeSceneToHash(scene);
}
