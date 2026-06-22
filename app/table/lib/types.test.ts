/**
 * Tests for phase 1.4 logic: type inference, locale parsing, sort, filter.
 */
import { describe, expect, test } from "bun:test";
import { docFromRows, getCell } from "./model";
import {
  localeFromTag,
  parseNumber,
  parseDate,
  parseBool,
  inferColumnType,
  compareValues,
  formatValue,
  DEFAULT_FORMAT,
} from "./coltypes";
import { sortDoc } from "./sort";
import { computeView, type ColumnFilter } from "./filter";

const enUS = localeFromTag("en-US");
const deDE = localeFromTag("de-DE");

describe("locale number parsing", () => {
  test("US grouping", () => expect(parseNumber("1,234.56", enUS)).toBe(1234.56));
  test("DE grouping", () => expect(parseNumber("1.234,56", deDE)).toBe(1234.56));
  test("percent", () => expect(parseNumber("50%", enUS)).toBe(0.5));
  test("not a number", () => expect(parseNumber("abc", enUS)).toBeNull());
  test("currency-ish", () => expect(parseNumber("$1,000", enUS)).toBe(1000));
});

describe("bool + date parsing", () => {
  test("bool", () => {
    expect(parseBool("yes")).toBe(true);
    expect(parseBool("0")).toBe(false);
    expect(parseBool("maybe")).toBeNull();
  });
  test("iso date", () => expect(parseDate("2025-01-15", enUS)).not.toBeNull());
  test("dmy vs mdy", () => {
    const d = new Date(parseDate("03/04/2025", deDE)!); // day-first → 3 April
    expect(d.getMonth()).toBe(3);
    const u = new Date(parseDate("03/04/2025", enUS)!); // month-first → 4 March
    expect(u.getMonth()).toBe(2);
  });
});

describe("inference", () => {
  test("integer column", () => {
    const d = docFromRows([["1"], ["2"], ["3"]]);
    expect(inferColumnType(d, 0, enUS)).toBe("integer");
  });
  test("number column", () => {
    const d = docFromRows([["1.5"], ["2.0"], ["3.25"]]);
    expect(inferColumnType(d, 0, enUS)).toBe("number");
  });
  test("text column", () => {
    const d = docFromRows([["apple"], ["pear"]]);
    expect(inferColumnType(d, 0, enUS)).toBe("text");
  });
  test("skips header row", () => {
    const d = docFromRows([["count"], ["1"], ["2"]], "x", true);
    expect(inferColumnType(d, 0, enUS)).toBe("integer");
  });
});

describe("sort", () => {
  test("numeric ascending (not lexical)", () => {
    const d = sortDoc(docFromRows([["10"], ["2"], ["1"]]), [{ col: 0, dir: "asc" }], enUS);
    expect([getCell(d, 0, 0), getCell(d, 1, 0), getCell(d, 2, 0)]).toEqual(["1", "2", "10"]);
  });
  test("descending", () => {
    const d = sortDoc(docFromRows([["1"], ["2"], ["10"]]), [{ col: 0, dir: "desc" }], enUS);
    expect(getCell(d, 0, 0)).toBe("10");
  });
  test("keeps header pinned", () => {
    const d = sortDoc(docFromRows([["n"], ["3"], ["1"]], "x", true), [{ col: 0, dir: "asc" }], enUS);
    expect(getCell(d, 0, 0)).toBe("n");
    expect(getCell(d, 1, 0)).toBe("1");
  });
  test("multi-column", () => {
    const d = sortDoc(
      docFromRows([["b", "2"], ["a", "2"], ["a", "1"]]),
      [{ col: 0, dir: "asc" }, { col: 1, dir: "asc" }],
      enUS,
    );
    expect([getCell(d, 0, 0), getCell(d, 0, 1)]).toEqual(["a", "1"]);
    expect([getCell(d, 1, 0), getCell(d, 1, 1)]).toEqual(["a", "2"]);
  });
  test("100k rows under 500ms", () => {
    const rows = Array.from({ length: 100000 }, () => [String(Math.floor(performance.now() % 99999) + 1)]);
    // deterministic-ish values without Math.random: use index mix
    for (let i = 0; i < rows.length; i++) rows[i][0] = String((i * 2654435761) % 100000);
    const big = docFromRows(rows);
    const t = performance.now();
    sortDoc(big, [{ col: 0, dir: "asc" }], enUS);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("compare + format", () => {
  test("empty sorts last", () => {
    expect(compareValues("", "5", "number", enUS)).toBeGreaterThan(0);
  });
  test("format thousands", () => {
    expect(formatValue("1234.5", "number", { ...DEFAULT_FORMAT, style: "thousands", decimals: 2 }, enUS)).toBe("1,234.50");
  });
  test("format percent", () => {
    expect(formatValue("0.5", "number", { ...DEFAULT_FORMAT, style: "percent", decimals: 0 }, enUS)).toBe("50%");
  });
});

describe("filter view", () => {
  const D = () => docFromRows([["name", "qty"], ["a", "5"], ["b", "12"], ["c", "3"]], "x", true);
  test("gt predicate keeps header + matches", () => {
    const f: ColumnFilter[] = [{ col: 1, op: "gt", value: "4" }];
    const view = computeView(D(), f, enUS)!;
    expect(view).toEqual([0, 1, 2]); // header, a(5), b(12)
  });
  test("contains", () => {
    const f: ColumnFilter[] = [{ col: 0, op: "contains", value: "b" }];
    expect(computeView(D(), f, enUS)).toEqual([0, 2]);
  });
  test("no filters → null", () => {
    expect(computeView(D(), [], enUS)).toBeNull();
  });
});
