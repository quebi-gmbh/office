/** Small download helpers for /table exports. */

export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function downloadBlob(data: Blob | ArrayBuffer, filename: string, mime = "application/octet-stream"): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string, ext: string): string {
  const base = (name.trim() || "table").replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-");
  return `${base}.${ext}`;
}
