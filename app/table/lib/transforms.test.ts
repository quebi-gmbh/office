/**
 * Tests for phase 2.2 data transforms.
 */
import { describe, expect, test } from "bun:test";
import { docFromRows, toRows, getCell } from "./model";
import {
  dedupeRows,
  splitColumn,
  mergeColumns,
  transformColumns,
  fillDown,
  transpose,
  unpivot,
  groupAggregate,
  flashFill,
} from "./transforms";

describe("dedupe", () => {
  test("removes duplicate rows", () => {
    const d = dedupeRows(docFromRows([["a"], ["a"], ["b"]]));
    expect(toRows(d).map((r) => r[0])).toEqual(["a", "b"]);
  });
  test("by selected columns", () => {
    const d = dedupeRows(docFromRows([["a", "1"], ["a", "2"], ["b", "3"]]), [0]);
    expect(d.nRows).toBe(2);
  });
});

describe("split", () => {
  test("by delimiter", () => {
    const d = splitColumn(docFromRows([["a-b"], ["c-d"]]), 0, { delimiter: "-" });
    expect(toRows(d)).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("merge", () => {
  test("template with letters", () => {
    const d = mergeColumns(docFromRows([["a", "b"]]), "{A}-{B}");
    expect(getCell(d, 0, 2)).toBe("a-b");
  });
});

describe("transform columns", () => {
  test("upper", () => {
    const d = transformColumns(docFromRows([["ab"], ["cd"]]), [0], { kind: "upper" });
    expect(getCell(d, 0, 0)).toBe("AB");
  });
  test("regex replace", () => {
    const d = transformColumns(docFromRows([["a1b2"]]), [0], { kind: "regex", pattern: "\\d", replacement: "#" });
    expect(getCell(d, 0, 0)).toBe("a#b#");
  });
});

describe("fill down", () => {
  test("fills blanks below", () => {
    const d = fillDown(docFromRows([["x"], [""], [""], ["y"], [""]]));
    expect(toRows(d).map((r) => r[0])).toEqual(["x", "x", "x", "y", "y"]);
  });
});

describe("transpose", () => {
  test("swaps rows/cols", () => {
    const d = transpose(docFromRows([["a", "b"], ["c", "d"]]));
    expect(toRows(d)).toEqual([["a", "c"], ["b", "d"]]);
  });
});

describe("unpivot", () => {
  test("melts value columns", () => {
    const d = unpivot(docFromRows([["id", "q1", "q2"], ["x", "1", "2"]], "t", true), [0], [1, 2]);
    expect(toRows(d)).toEqual([
      ["id", "variable", "value"],
      ["x", "q1", "1"],
      ["x", "q2", "2"],
    ]);
  });
});

describe("group + aggregate", () => {
  test("sum and count by group", () => {
    const doc = docFromRows([["cat", "n"], ["a", "1"], ["a", "3"], ["b", "10"]], "t", true);
    const rows = groupAggregate(doc, [0], [{ col: 1, fn: "sum" }, { col: 1, fn: "count" }]);
    expect(rows[0]).toEqual(["cat", "sum(n)", "count(n)"]);
    expect(rows).toContainEqual(["a", "4", "2"]);
    expect(rows).toContainEqual(["b", "10", "1"]);
  });
  test("median", () => {
    const doc = docFromRows([["g", "v"], ["a", "1"], ["a", "2"], ["a", "9"]], "t", true);
    const rows = groupAggregate(doc, [0], [{ col: 1, fn: "median" }]);
    expect(rows[1]).toEqual(["a", "2"]);
  });
  test("100k rows under 1s", () => {
    const data: string[][] = [["g", "v"]];
    for (let i = 0; i < 100000; i++) data.push([`g${i % 100}`, String(i % 7)]);
    const doc = docFromRows(data, "t", true);
    const t = performance.now();
    const rows = groupAggregate(doc, [0], [{ col: 1, fn: "sum" }]);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(rows.length).toBe(101); // header + 100 groups
  });
});

describe("flash-fill", () => {
  test("extract first word", () => {
    const doc = docFromRows([["Alice Smith", "Alice"], ["Bob Jones", ""]]);
    const d = flashFill(doc, 1);
    expect(getCell(d, 1, 1)).toBe("Bob");
  });
  test("format case (upper)", () => {
    const doc = docFromRows([["abc", "ABC"], ["def", ""]]);
    const d = flashFill(doc, 1);
    expect(getCell(d, 1, 1)).toBe("DEF");
  });
  test("build email from First Last", () => {
    const doc = docFromRows([
      ["First", "Last", "email"],
      ["Alice", "Smith", "alice.smith@x.com"],
      ["Bob", "Jones", ""],
    ], "t", true);
    const d = flashFill(doc, 2);
    expect(getCell(d, 2, 2)).toBe("bob.jones@x.com");
  });
});
