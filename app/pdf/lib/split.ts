/**
 * Split a PDF into multiple PDFs. Returns one or more `{ name, bytes }`
 * results so the caller can offer "download each" / "download zip".
 *
 * Three modes:
 *   - byRanges: a list of inclusive 1-based ranges like `[[1,3],[4,4],[5,8]]`
 *   - everyN:   group N pages at a time
 *   - singles:  one PDF per page
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

export type SplitResult = { name: string; bytes: Uint8Array };

function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

async function buildFromIndices(
  src: import("pdf-lib").PDFDocument,
  indices: number[],
): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  return savePdfDoc(out);
}

export async function splitByRanges(
  bytes: Uint8Array,
  name: string,
  /** 1-based inclusive ranges, e.g. [[1,3],[5,9]]. */
  ranges: Array<[number, number]>,
): Promise<SplitResult[]> {
  const src = await loadPdfDoc(bytes);
  const total = src.getPageCount();
  const out: SplitResult[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i]!;
    const lo = Math.max(1, Math.min(total, Math.floor(start)));
    const hi = Math.max(lo, Math.min(total, Math.floor(end)));
    const indices: number[] = [];
    for (let p = lo; p <= hi; p++) indices.push(p - 1);
    const bytesOut = await buildFromIndices(src, indices);
    out.push({
      name: `${baseName(name)}_${pad(lo)}-${pad(hi)}.pdf`,
      bytes: bytesOut,
    });
  }
  return out;
}

export async function splitEveryN(
  bytes: Uint8Array,
  name: string,
  n: number,
): Promise<SplitResult[]> {
  if (n < 1) throw new Error("n must be ≥ 1");
  const src = await loadPdfDoc(bytes);
  const total = src.getPageCount();
  const out: SplitResult[] = [];
  for (let start = 0; start < total; start += n) {
    const end = Math.min(start + n - 1, total - 1);
    const indices: number[] = [];
    for (let p = start; p <= end; p++) indices.push(p);
    const bytesOut = await buildFromIndices(src, indices);
    out.push({
      name: `${baseName(name)}_${pad(start + 1)}-${pad(end + 1)}.pdf`,
      bytes: bytesOut,
    });
  }
  return out;
}

export async function splitSingles(
  bytes: Uint8Array,
  name: string,
): Promise<SplitResult[]> {
  return splitEveryN(bytes, name, 1);
}

/**
 * Parse a human-friendly range string like "1-3, 5, 7-9" into 1-based
 * `[start, end]` ranges. Empty / invalid → throws.
 */
export function parseRanges(input: string, max: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const parts = input.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("No ranges given");
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`Bad range: "${part}"`);
    const lo = Math.max(1, Math.min(max, parseInt(m[1]!, 10)));
    const hi = m[2] ? Math.max(1, Math.min(max, parseInt(m[2]!, 10))) : lo;
    out.push([Math.min(lo, hi), Math.max(lo, hi)]);
  }
  return out;
}
