/**
 * Sharing helpers: share-by-URL (gzip + base64url in the hash, same approach as
 * /code and /docs), URL-to-table fetch, "Open in /code" handoff via
 * sessionStorage, and PNG export of the grid.
 */
import type { Workbook } from "~/table/lib/workbook";
import { toWorkbook } from "~/table/lib/workbook";
import { type TableDoc, toRows } from "~/table/lib/model";
import { setCodeHandoff } from "~/lib/code-handoff";

const SHARE_WARN_BYTES = 30 * 1024;

export interface ShareResult {
  url: string;
  oversized: boolean;
}

export async function shareUrl(wb: Workbook): Promise<ShareResult> {
  const json = JSON.stringify(wb);
  const encoded = await gzipBase64url(json);
  const url = `${location.origin}${location.pathname}#table=${encoded}`;
  return { url, oversized: url.length > 8000 || new TextEncoder().encode(json).length > SHARE_WARN_BYTES };
}

export async function decodeShareHash(hash: string): Promise<Workbook | null> {
  const m = hash.match(/[#&]?table=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const json = await gunzipBase64url(m[1]);
    return toWorkbook(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Fetch a URL and return its text. Throws a clear error when blocked by CORS. */
export async function fetchUrlToText(url: string): Promise<{ name: string; text: string }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Could not fetch — the site likely blocks cross-origin requests (CORS).");
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const name = url.split("/").pop()?.split("?")[0] || "url";
  return { name, text };
}

// ── Open in /code ──────────────────────────────────────────────────────────────

export function openInCode(sheet: TableDoc, format: "csv" | "json" | "python"): void {
  const rows = toRows(sheet);
  let text: string;
  let langId: string;
  if (format === "csv") {
    text = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    langId = "text";
  } else if (format === "json") {
    text = JSON.stringify(rows, null, 2);
    langId = "json";
  } else {
    text = "data = [\n" + rows.map((r) => "    [" + r.map((c) => JSON.stringify(c)).join(", ") + "]").join(",\n") + "\n]\n";
    langId = "python";
  }
  setCodeHandoff({ text, langId });
  location.assign("/code");
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ── PNG export ──────────────────────────────────────────────────────────────────

export async function exportPng(el: HTMLElement, filename: string): Promise<void> {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: getComputedStyle(document.body).backgroundColor });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ── gzip helpers (mirrors doc/io.ts) ─────────────────────────────────────────────

async function gzipBase64url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return abToB64url(buf);
}

async function gunzipBase64url(b64: string): Promise<string> {
  const bytes = b64urlToBytes(b64);
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  await writer.write(bytes.buffer as ArrayBuffer);
  await writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

function abToB64url(buf: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(buf)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
