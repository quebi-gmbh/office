/**
 * Build a brand-new PDF from one or more raster images. Each image becomes a
 * single page sized to the image's native dimensions (1 image px = 1 point)
 * unless `pageSize` is given, in which case the image is centred & contained
 * inside the chosen paper size.
 */
import { getPdfLib, savePdfDoc } from "~/pdf/io/pdflib";

export type ImageInput = { name?: string; bytes: Uint8Array };
export type PaperSize = { width: number; height: number };

/** A4 in points (72/inch). */
export const PAPER_A4: PaperSize = { width: 595.28, height: 841.89 };
export const PAPER_LETTER: PaperSize = { width: 612, height: 792 };

function detectFormat(bytes: Uint8Array): "png" | "jpg" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return "png";
}

export async function imagesToPdf(
  images: ImageInput[],
  opts: { pageSize?: PaperSize | null; margin?: number } = {},
): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const pdf = await PDFDocument.create();
  const margin = opts.margin ?? 0;

  for (const img of images) {
    const fmt = detectFormat(img.bytes);
    const embedded = fmt === "png"
      ? await pdf.embedPng(img.bytes)
      : await pdf.embedJpg(img.bytes);

    if (opts.pageSize) {
      const page = pdf.addPage([opts.pageSize.width, opts.pageSize.height]);
      const availW = opts.pageSize.width - 2 * margin;
      const availH = opts.pageSize.height - 2 * margin;
      const scale = Math.min(availW / embedded.width, availH / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      page.drawImage(embedded, {
        x: (opts.pageSize.width - w) / 2,
        y: (opts.pageSize.height - h) / 2,
        width: w,
        height: h,
      });
    } else {
      const page = pdf.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    }
  }

  return savePdfDoc(pdf);
}
