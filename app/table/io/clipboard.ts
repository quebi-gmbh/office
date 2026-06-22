/**
 * Clipboard write for `/table` — copy/cut a rectangular range as both TSV
 * (text/plain, what Excel & Sheets read) and an HTML `<table>` (text/html, for
 * rich targets). TSV uses CRLF row endings and quotes cells that contain a tab,
 * newline, or quote, so the shape round-trips cleanly into Excel.
 */
import { type TableDoc, getCell } from "~/table/lib/model";
import type { Rect } from "~/table/lib/selection";

export function rangeToRows(doc: TableDoc, rect: Rect): string[][] {
  const rows: string[][] = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    const row: string[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) row.push(getCell(doc, r, c));
    rows.push(row);
  }
  return rows;
}

function tsvCell(v: string): string {
  return /[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toTSV(rows: string[][]): string {
  return rows.map((r) => r.map(tsvCell).join("\t")).join("\r\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function toHtmlTable(rows: string[][]): string {
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${body}</table>`;
}

/** Copy a range to the clipboard (TSV + HTML flavours, with a text fallback). */
export async function copyRange(doc: TableDoc, rect: Rect): Promise<void> {
  const rows = rangeToRows(doc, rect);
  const tsv = toTSV(rows);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([tsv], { type: "text/plain" }),
          "text/html": new Blob([toHtmlTable(rows)], { type: "text/html" }),
        }),
      ]);
      return;
    }
  } catch {
    /* fall through to plain text */
  }
  await navigator.clipboard.writeText(tsv);
}
