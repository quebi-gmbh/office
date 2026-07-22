/**
 * Export helpers — build an SVG string and rasterise it to PNG / JPEG / WebP,
 * wrap a raster in a PDF (pdf-lib), copy SVG markup to the clipboard, and a
 * small download utility. Everything runs client-side; nothing is uploaded.
 */
import { PDFDocument } from "pdf-lib";
import { sceneToSvg, type SvgOptions } from "~/vector/lib/serialize";
import { boundsToRect, unionBounds } from "~/vector/lib/geometry";
import type { VNode, VectorScene } from "~/vector/lib/types";

export type RasterFormat = "png" | "jpeg" | "webp";

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

export function exportSvgBlob(scene: VectorScene, opts?: SvgOptions): Blob {
  return new Blob([sceneToSvg(scene, opts)], { type: "image/svg+xml" });
}

/** Output pixel size for a raster export at `scale`, honouring a crop. */
function outputSize(scene: VectorScene, scale: number, crop?: VNode[], margin = 0) {
  if (crop && crop.length > 0) {
    const b = unionBounds(crop);
    if (b) {
      const r = boundsToRect(b);
      return { w: Math.max(1, r.w + margin * 2), h: Math.max(1, r.h + margin * 2) };
    }
  }
  return { w: scene.doc.width, h: scene.doc.height };
}

export interface RasterOptions {
  scale?: number;
  format?: RasterFormat;
  /** 0..1 for jpeg/webp. */
  quality?: number;
  /** Crop to these nodes (export selection). */
  crop?: VNode[];
  margin?: number;
}

/** Rasterise the scene by drawing its SVG onto a canvas via an <img>. */
export async function exportRasterBlob(scene: VectorScene, opts: RasterOptions = {}): Promise<Blob> {
  const { scale = 1, format = "png", quality = 0.92, crop, margin = 0 } = opts;
  const svg = sceneToSvg(scene, { crop, margin });
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to render SVG for export"));
      img.src = svgUrl;
    });

    const { w, h } = outputSize(scene, scale, crop, margin);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    const opaque = format === "jpeg";
    if ((scene.doc.background && scene.doc.background !== "transparent") || opaque) {
      ctx.fillStyle = scene.doc.background && scene.doc.background !== "transparent" ? scene.doc.background : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const mime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), mime, quality);
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);
  }
}

/** Back-compat PNG helper. */
export async function exportPngBlob(scene: VectorScene, scale = 1): Promise<Blob> {
  return exportRasterBlob(scene, { scale, format: "png" });
}

/** Wrap a rasterised page inside a single-page PDF via pdf-lib. */
export async function exportPdfBlob(scene: VectorScene, opts: RasterOptions = {}): Promise<Blob> {
  const scale = opts.scale ?? 2;
  const pngBlob = await exportRasterBlob(scene, { ...opts, scale, format: "png" });
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(pngBytes);
  const { w, h } = outputSize(scene, 1, opts.crop, opts.margin ?? 0);
  const page = pdf.addPage([w, h]);
  page.drawImage(png, { x: 0, y: 0, width: w, height: h });
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** Copy the scene's SVG markup to the clipboard. Returns success. */
export async function copyAsSvg(scene: VectorScene, opts?: SvgOptions): Promise<boolean> {
  const svg = sceneToSvg(scene, opts);
  try {
    await navigator.clipboard.writeText(svg);
    return true;
  } catch {
    return false;
  }
}
