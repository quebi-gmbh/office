/**
 * Save helpers — download via anchor element (works everywhere) and an opt-in
 * File System Access Handle save for browsers that support it.
 */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = "application/pdf",
): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string): void {
  const enc = new TextEncoder();
  downloadBytes(enc.encode(text), filename, "text/plain;charset=utf-8");
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Append a "-edited" suffix before the extension. */
export function suffixedName(name: string, suffix = "-edited"): string {
  const m = name.match(/^(.*)(\.pdf)$/i);
  if (!m) return `${name}${suffix}.pdf`;
  return `${m[1]}${suffix}${m[2]}`;
}
