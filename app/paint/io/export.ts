/**
 * Export utilities — render the main canvas to a downloadable Blob.
 */

export type ExportFormat = "image/png" | "image/jpeg" | "image/webp";

/** Generate a default filename like `paint-2026-05-20-1432.png`. */
export function defaultFilename(format: ExportFormat): string {
  const ext = format.split("/")[1] as string;
  const now = new Date();
  const ts = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `paint-${ts}.${ext}`;
}

/** Convert canvas content to a Blob in the given format. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      format,
      quality,
    );
  });
}

/** Trigger a browser download of the given blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after a short delay to allow the download to start.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Copy a PNG blob to the system clipboard.
 * Uses ClipboardItem (supported in all modern browsers; may require
 * `clipboard-write` permission on Chrome).
 * Returns true on success, false if the API is unavailable or denied.
 */
export async function copyToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write) return false;
    const blob = await canvasToBlob(canvas, "image/png", 1);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
