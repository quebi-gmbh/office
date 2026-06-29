/**
 * Read and write the PDF's info dictionary.
 *
 * pdf-lib normalises this into typed accessors (title/author/...). We expose
 * a flat shape that maps 1:1 onto Set/Get pairs.
 */
import { loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

export type Metadata = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string; // ISO 8601 or ""
  modificationDate: string;
};

export async function readMetadata(bytes: Uint8Array): Promise<Metadata> {
  const pdf = await loadPdfDoc(bytes);
  return {
    title: pdf.getTitle() ?? "",
    author: pdf.getAuthor() ?? "",
    subject: pdf.getSubject() ?? "",
    keywords: (pdf.getKeywords() ?? "")
      .toString()
      .replaceAll(",", ", "),
    creator: pdf.getCreator() ?? "",
    producer: pdf.getProducer() ?? "",
    creationDate: pdf.getCreationDate()?.toISOString() ?? "",
    modificationDate: pdf.getModificationDate()?.toISOString() ?? "",
  };
}

export async function writeMetadata(
  bytes: Uint8Array,
  meta: Partial<Metadata>,
): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  if (meta.title !== undefined) pdf.setTitle(meta.title);
  if (meta.author !== undefined) pdf.setAuthor(meta.author);
  if (meta.subject !== undefined) pdf.setSubject(meta.subject);
  if (meta.keywords !== undefined) {
    const kw = meta.keywords.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
    pdf.setKeywords(kw);
  }
  if (meta.creator !== undefined) pdf.setCreator(meta.creator);
  if (meta.producer !== undefined) pdf.setProducer(meta.producer);
  if (meta.creationDate) {
    const d = new Date(meta.creationDate);
    if (!Number.isNaN(d.getTime())) pdf.setCreationDate(d);
  }
  if (meta.modificationDate) {
    const d = new Date(meta.modificationDate);
    if (!Number.isNaN(d.getTime())) pdf.setModificationDate(d);
  }
  return savePdfDoc(pdf);
}
