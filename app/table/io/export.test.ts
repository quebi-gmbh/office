/**
 * Export format tests — focus on the executable/parseable targets.
 */
import { describe, expect, test } from "bun:test";
import { docFromRows, type ColumnType } from "~/table/lib/model";
import { localeFromTag } from "~/table/lib/coltypes";
import { EXPORT_TARGETS, type ExportCtx } from "./export";

const enUS = localeFromTag("en-US");

function ctx(rows: string[][], types: ColumnType[], hasHeader = false): ExportCtx {
  const doc = docFromRows(rows, "data", hasHeader);
  return { doc, types, formats: types.map(() => null), locale: enUS };
}

const get = (id: string) => EXPORT_TARGETS.find((t) => t.id === id)!;

describe("data exports", () => {
  const c = ctx([["a", "b"], ["1", "2"], ["3", "4"]], ["integer", "integer"], true);

  test("csv keeps raw values + CRLF", () => {
    expect(get("csv").toText!(c)).toBe("a,b\r\n1,2\r\n3,4");
  });

  test("json array-of-objects with numeric values", () => {
    expect(JSON.parse(get("json").toText!(c))).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ]);
  });

  test("jsonl one object per line", () => {
    expect(get("jsonl").toText!(c).split("\n")).toEqual(['{"a":1,"b":2}', '{"a":3,"b":4}']);
  });

  test("markdown table", () => {
    expect(get("markdown").toText!(c)).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |");
  });
});

describe("code exports are executable-shaped", () => {
  const c = ctx([["1", "2"], ["3", "4"]], ["integer", "integer"]);

  test("python list of lists", () => {
    expect(get("python").toText!(c)).toBe("[[1, 2], [3, 4]]");
  });

  test("python list of dicts when header present", () => {
    const ch = ctx([["x", "y"], ["1", "2"]], ["integer", "integer"], true);
    expect(get("python").toText!(ch)).toBe("[{'x': 1, 'y': 2}]");
  });

  test("numpy", () => {
    expect(get("numpy").toText!(c)).toBe("np.array([[1, 2], [3, 4]])");
  });

  test("matlab", () => {
    expect(get("matlab").toText!(c)).toBe("[1 2; 3 4]");
  });

  test("c initialiser", () => {
    expect(get("c").toText!(c)).toBe("{{1, 2}, {3, 4}}");
  });

  test("sql insert", () => {
    const ch = ctx([["name", "age"], ["bob", "30"]], ["text", "integer"], true);
    expect(get("sql").toText!(ch)).toBe("INSERT INTO data (name, age) VALUES ('bob', 30);");
  });
});

describe("python literal round-trips strings + bools", () => {
  test("strings quoted, bools cased", () => {
    const c = ctx([["a", "true"], ["b", "false"]], ["text", "bool"]);
    expect(get("python").toText!(c)).toBe("[['a', True], ['b', False]]");
  });
});
