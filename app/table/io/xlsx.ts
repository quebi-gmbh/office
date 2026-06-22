/**
 * XLSX import — reads the first worksheet of a workbook into row-major strings.
 *
 * SheetJS (`xlsx`) is heavy (~400 KB), so it is **dynamically imported** here
 * and only ever pulled when the user actually drops/pastes an .xlsx file. It
 * must never appear in the initial `/table` chunk.
 */

/** Read an .xlsx ArrayBuffer into row-major string cells (first sheet). */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [[""]];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return rows.map((r) => r.map((c) => (c == null ? "" : String(c))));
}
