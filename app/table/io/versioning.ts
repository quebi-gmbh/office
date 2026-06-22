/**
 * Lightweight version history for /table — on-demand + auto snapshots of the
 * workbook, stored in localStorage (capped). Mirrors the spirit of
 * app/doc/versioning.ts. Restoring a snapshot doesn't touch the live draft until
 * the caller applies it.
 */
import type { Workbook } from "~/table/lib/workbook";

const KEY = "office:table:versions";
const MAX = 30;

export interface Snapshot {
  id: string;
  savedAt: number;
  name: string;
  rows: number;
  sheets: number;
  workbook: Workbook;
}

export function listSnapshots(): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Snapshot[];
  } catch {
    return [];
  }
}

function save(list: Snapshot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota — drop oldest and retry once */
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, Math.floor(MAX / 2))));
    } catch {
      /* give up */
    }
  }
}

export function saveSnapshot(wb: Workbook, at: number): Snapshot {
  const snap: Snapshot = {
    id: `${at}-${Math.floor(at % 100000)}`,
    savedAt: at,
    name: wb.name || "Untitled",
    rows: wb.sheets.reduce((n, s) => n + s.nRows, 0),
    sheets: wb.sheets.length,
    workbook: wb,
  };
  save([snap, ...listSnapshots()]);
  return snap;
}

export function deleteSnapshot(id: string): void {
  save(listSnapshots().filter((s) => s.id !== id));
}
