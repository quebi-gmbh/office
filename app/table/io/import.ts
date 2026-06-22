/**
 * Turn dropped files and clipboard payloads into an import source for the
 * preview modal (or a raw block for paste-into-selection).
 */
import { detect, parseHtmlTable, type Detection } from "~/lib/table/detect";
import { readXlsx } from "./xlsx";
import type { ImportSource } from "~/table/ui/DetectModal";

const TEXT_EXTS = ["csv", "tsv", "txt", "json", "jsonl", "ndjson", "html", "htm", "md", "markdown"];

export function sourceFromText(text: string, filename?: string): ImportSource {
  return { text, detection: detect(text, filename), filename };
}

/** Read a dropped file into an import source (xlsx parsed eagerly, others text). */
export async function sourceFromFile(file: File): Promise<ImportSource> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const rows = await readXlsx(await file.arrayBuffer());
    const detection: Detection = {
      format: "csv",
      rows,
      hasHeader: rows.length > 1,
      delimiter: ",",
    };
    return { detection, filename: file.name };
  }
  const text = await file.text();
  return sourceFromText(text, file.name);
}

/** Whether a dropped file looks importable by extension. */
export function isImportableFile(name: string): boolean {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext === "xlsx" || ext === "xls" || (ext != null && TEXT_EXTS.includes(ext));
}

/**
 * Extract an import source from a paste. Prefers a real HTML `<table>` flavour
 * (Excel / Sheets / web pages put one on the clipboard) over the plain-text
 * fallback; otherwise sniffs the plain text.
 */
export function sourceFromClipboard(
  data: DataTransfer,
): ImportSource | null {
  const html = data.getData("text/html");
  if (html && parseHtmlTable(html)) {
    return { text: html, detection: parseHtmlTable(html)! };
  }
  const text = data.getData("text/plain");
  if (text) return sourceFromText(text);
  return null;
}

/** Parse a clipboard payload into a rectangular block for paste-into-selection. */
export function blockFromClipboard(data: DataTransfer): string[][] | null {
  const src = sourceFromClipboard(data);
  return src ? src.detection.rows : null;
}
