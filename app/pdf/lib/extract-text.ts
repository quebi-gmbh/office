/**
 * Extract plain text via pdfjs. We return per-page strings so the UI can
 * choose between "save as flat .txt" and "save each page as its own .txt".
 */
import { loadPdfJsDoc, extractPageText } from "~/pdf/io/pdfjs";

export type PageText = { page: number; text: string };

export async function extractAllText(
  bytes: Uint8Array,
  password?: string,
): Promise<PageText[]> {
  const pdf = await loadPdfJsDoc(bytes, password);
  const out: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    out.push({ page: i, text: await extractPageText(page) });
  }
  await pdf.cleanup();
  await pdf.loadingTask.destroy();
  return out;
}

export function joinPagesAsText(pages: PageText[]): string {
  return pages
    .map((p) => `--- Page ${p.page} ---\n${p.text}`)
    .join("\n\n");
}
