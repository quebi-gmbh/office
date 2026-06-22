/**
 * Workbook = the multi-sheet document (phase 2.1). Each sheet is a `TableDoc`
 * (its `name` field is the tab label). The workbook holds the document title,
 * the ordered sheets, and the active index.
 *
 * A v1 single-sheet record (a bare `TableDoc`) migrates to a workbook on first
 * open by wrapping it as `sheets[0]`.
 */
import { type TableDoc, createEmptyDoc } from "./model";

export interface Workbook {
  version: 2;
  /** Document title. */
  name: string;
  sheets: TableDoc[];
  active: number;
}

let idCounter = 0;
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `s${++idCounter}`;
}

export function createWorkbook(title = "Untitled"): Workbook {
  const sheet = createEmptyDoc();
  sheet.id = newId();
  sheet.name = "Sheet1";
  return { version: 2, name: title, sheets: [sheet], active: 0 };
}

/** Accepts a stored Workbook (v2) or a legacy TableDoc (v1) and returns a
 *  Workbook. Used on load to migrate older docs in place. */
export function toWorkbook(stored: unknown): Workbook {
  const s = stored as Partial<Workbook> & Partial<TableDoc>;
  if (s && (s as Workbook).version === 2 && Array.isArray((s as Workbook).sheets)) {
    const wb = s as Workbook;
    // Ensure every sheet has an id + name.
    wb.sheets.forEach((sh, i) => {
      if (!sh.id) sh.id = newId();
      if (!sh.name) sh.name = `Sheet${i + 1}`;
    });
    wb.active = Math.max(0, Math.min(wb.active ?? 0, wb.sheets.length - 1));
    return wb;
  }
  // Legacy single-sheet TableDoc.
  const doc = stored as TableDoc;
  const title = doc.name || "Untitled";
  const sheet: TableDoc = { ...doc, id: newId(), name: "Sheet1" };
  return { version: 2, name: title, sheets: [sheet], active: 0 };
}

export function activeSheet(wb: Workbook): TableDoc {
  return wb.sheets[wb.active];
}

/** Replace the active sheet, returning a new workbook. */
export function withActiveSheet(wb: Workbook, sheet: TableDoc): Workbook {
  if (sheet === wb.sheets[wb.active]) return wb;
  const sheets = wb.sheets.slice();
  sheets[wb.active] = sheet;
  return { ...wb, sheets };
}

// ── Sheet operations ────────────────────────────────────────────────────────

function uniqueName(wb: Workbook, base: string): string {
  const names = new Set(wb.sheets.map((s) => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function addSheet(wb: Workbook): Workbook {
  const sheet = createEmptyDoc();
  sheet.id = newId();
  sheet.name = uniqueName(wb, `Sheet${wb.sheets.length + 1}`);
  const sheets = [...wb.sheets, sheet];
  return { ...wb, sheets, active: sheets.length - 1 };
}

export function deleteSheet(wb: Workbook, index: number): Workbook {
  if (wb.sheets.length <= 1) return wb; // keep at least one
  const sheets = wb.sheets.slice();
  sheets.splice(index, 1);
  const active = Math.max(0, Math.min(wb.active >= index ? wb.active - 1 : wb.active, sheets.length - 1));
  return { ...wb, sheets, active };
}

export function renameSheet(wb: Workbook, index: number, name: string): Workbook {
  const sheets = wb.sheets.slice();
  sheets[index] = { ...sheets[index], name: name.trim() || sheets[index].name };
  return { ...wb, sheets };
}

export function duplicateSheet(wb: Workbook, index: number): Workbook {
  const src = wb.sheets[index];
  const copy: TableDoc = {
    ...src,
    id: newId(),
    name: uniqueName(wb, `${src.name} copy`),
    cols: src.cols.map((c) => c.slice()),
  };
  const sheets = wb.sheets.slice();
  sheets.splice(index + 1, 0, copy);
  return { ...wb, sheets, active: index + 1 };
}

export function moveSheet(wb: Workbook, from: number, to: number): Workbook {
  if (to < 0 || to >= wb.sheets.length) return wb;
  const sheets = wb.sheets.slice();
  const [s] = sheets.splice(from, 1);
  sheets.splice(to, 0, s);
  const activeId = wb.sheets[wb.active].id;
  const active = sheets.findIndex((x) => x.id === activeId);
  return { ...wb, sheets, active: active < 0 ? 0 : active };
}

export function setActive(wb: Workbook, index: number): Workbook {
  if (index === wb.active || index < 0 || index >= wb.sheets.length) return wb;
  return { ...wb, active: index };
}
