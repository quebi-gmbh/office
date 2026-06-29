/**
 * Security ops. pdf-lib does **not** currently support producing encrypted
 * PDFs (the encryption code path was never landed upstream), so the only
 * safe op we can offer is "remove password" — we already load with
 * `ignoreEncryption: true`, so re-saving produces an unencrypted copy.
 *
 * If/when pdf-lib gains encryption support we can extend this module with
 * `encrypt(bytes, { userPassword, ownerPassword, permissions })`.
 */
import { loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

export async function removePassword(bytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await loadPdfDoc(bytes);
  return savePdfDoc(pdf);
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  const pdf = await loadPdfDoc(bytes);
  return pdf.isEncrypted;
}
