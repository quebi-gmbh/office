/**
 * Export helpers — build an SVG string and rasterise it to a PNG blob, plus a
 * small download utility. Everything runs client-side; nothing is uploaded.
 */
import { sceneToSvg } from "~/vector/lib/serialize";
import type { VectorScene } from "~/vector/lib/types";

export function defaultFilename(ext: string): string {
  return `drawing.${ext}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvgBlob(scene: VectorScene): Blob {
  return new Blob([sceneToSvg(scene)], { type: "image/svg+xml" });
}

/**
 * Rasterise the scene to a PNG blob at `scale`× the document size by drawing
 * the SVG onto a canvas via an <img>.
 */
export async function exportPngBlob(scene: VectorScene, scale = 1): Promise<Blob> {
  const svg = sceneToSvg(scene);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to render SVG for export"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(scene.doc.width * scale));
    canvas.height = Math.max(1, Math.round(scene.doc.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    if (scene.doc.background && scene.doc.background !== "transparent") {
      ctx.fillStyle = scene.doc.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
  }
}
