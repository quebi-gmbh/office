/** Encode/decode helpers for the share-by-URL feature, plus PNG rasterization. */

/** Base64-encode a UTF-8 string (safe for non-ASCII Typst source). */
export function encodeSource(src: string): string {
  const bytes = new TextEncoder().encode(src);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Inverse of {@link encodeSource}. Throws on malformed input. */
export function decodeSource(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const HASH_PREFIX = "#src=";

/** Build the `#src=…` URL hash fragment for a document. */
export function sourceToHash(src: string): string {
  return HASH_PREFIX + encodeURIComponent(encodeSource(src));
}

/** Extract document source from a URL hash, or null if none/invalid. */
export function hashToSource(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    return decodeSource(decodeURIComponent(hash.slice(HASH_PREFIX.length)));
  } catch {
    return null;
  }
}

/** Trigger a browser download of a blob under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Rasterize an SVG string to a PNG Blob (browser-only). The SVG produced by the
 * Typst renderer carries explicit width/height, so the intrinsic image size is
 * reliable; `scale` oversamples for a crisper bitmap.
 */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgUrl = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 1000;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("PNG encoding failed.")),
          "image/png",
        );
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Could not load the SVG for rasterization."));
    };
    img.src = svgUrl;
  });
}
