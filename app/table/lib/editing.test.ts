/**
 * Tests for phase 1.3 logic: structural ops, find/replace, and TSV clipboard.
 */
import { describe, expect, test } from "bun:test";
import {
  docFromRows,
  getCell,
  insertRows,
  deleteRows,
  insertCols,
  deleteCols,
  toRows,
} from "./model";
import { findMatches, replaceAll, replaceInValue, type FindOptions } from "./find";
import { toTSV, rangeToRows } from "~/table/io/clipboard";

const D = () =>
  docFromRows([
    ["name", "city"],
    ["alice", "berlin"],
    ["bob", "paris"],
  ]);

const opts = (o: Partial<FindOptions> = {}): FindOptions => ({
  caseSensitive: false,
  regex: false,
  wholeCell: false,
  scope: "sheet",
  ...o,
});

describe("structural ops", () => {
  test("insertRows adds blank rows", () => {
    const d = insertRows(D(), 1, 1);
    expect(d.nRows).toBe(4);
    expect(getCell(d, 1, 0)).toBe("");
    expect(getCell(d, 2, 0)).toBe("alice");
  });

  test("deleteRows removes a row", () => {
    const d = deleteRows(D(), 1, 1);
    expect(d.nRows).toBe(2);
    expect(getCell(d, 1, 0)).toBe("bob");
  });

  test("insertCols adds a blank column", () => {
    const d = insertCols(D(), 1, 1);
    expect(d.nCols).toBe(3);
    expect(getCell(d, 0, 1)).toBe("");
    expect(getCell(d, 0, 2)).toBe("city");
  });

  test("deleteCols removes a column", () => {
    const d = deleteCols(D(), 0, 1);
    expect(d.nCols).toBe(1);
    expect(getCell(d, 0, 0)).toBe("city");
  });

  test("deleteRows never empties the doc", () => {
    const d = deleteRows(deleteRows(deleteRows(D(), 0), 0), 0);
    expect(d.nRows).toBe(1);
  });
});

describe("find & replace", () => {
  test("case-insensitive contains", () => {
    expect(findMatches(D(), "BER", opts())).toEqual([{ r: 1, c: 1 }]);
  });

  test("whole-cell match", () => {
    expect(findMatches(D(), "bob", opts({ wholeCell: true }))).toEqual([{ r: 2, c: 0 }]);
    expect(findMatches(D(), "bo", opts({ wholeCell: true }))).toEqual([]);
  });

  test("regex match", () => {
    expect(findMatches(D(), "^p", opts({ regex: true })).length).toBe(1);
  });

  test("replaceAll counts and rewrites", () => {
    const { doc, count } = replaceAll(D(), "i", "I", opts());
    expect(count).toBe(4); // city, alice, berlin, paris
    expect(getCell(doc, 1, 0)).toBe("alIce");
  });

  test("replaceInValue whole cell", () => {
    expect(replaceInValue("bob", "bob", "BOB", opts({ wholeCell: true }))).toBe("BOB");
  });

  test("scope=selection limits the sweep", () => {
    const rect = { r0: 0, c0: 0, r1: 2, c1: 0 };
    expect(findMatches(D(), "a", opts({ scope: "selection", rect })).map((m) => m.c)).toEqual([0, 0]);
  });

  test("10k rows under 200ms", () => {
    const rows = Array.from({ length: 10000 }, (_, i) => [`row${i}`, i % 2 ? "x" : "y"]);
    const big = docFromRows(rows);
    const t = performance.now();
    const m = findMatches(big, "x", opts());
    const dt = performance.now() - t;
    expect(m.length).toBe(5000);
    expect(dt).toBeLessThan(200);
  });
});

describe("clipboard TSV", () => {
  test("range to TSV with CRLF", () => {
    const tsv = toTSV(rangeToRows(D(), { r0: 0, c0: 0, r1: 1, c1: 1 }));
    expect(tsv).toBe("name\tcity\r\nalice\tberlin");
  });

  test("quotes cells containing tab or newline", () => {
    const d = docFromRows([["a\tb", "c\nd"]]);
    expect(toTSV(toRows(d))).toBe('"a\tb"\t"c\nd"');
  });
});
