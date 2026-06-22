/**
 * Unit tests for the tabular format detector. Run with `bun test`.
 */
import { describe, expect, test } from "bun:test";
import {
  detect,
  parseDelimited,
  sniffDelimiter,
  parseJsonTable,
  parseMarkdownTable,
  parseHtmlTable,
  parseCodeArray,
  guessHasHeader,
  reparseDelimited,
} from "./detect";

describe("parseDelimited", () => {
  test("basic CSV", () => {
    expect(parseDelimited("a,b,c\n1,2,3", ",")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("quoted fields with embedded delimiter and newline", () => {
    const csv = 'name,note\n"Smith, J.","line1\nline2"\n';
    expect(parseDelimited(csv, ",")).toEqual([
      ["name", "note"],
      ["Smith, J.", "line1\nline2"],
    ]);
  });

  test("doubled quotes become one quote", () => {
    expect(parseDelimited('"a ""b"" c"', ",")).toEqual([['a "b" c']]);
  });

  test("CRLF line endings", () => {
    expect(parseDelimited("a,b\r\n1,2\r\n", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("trailing newline does not add an empty row", () => {
    expect(parseDelimited("a,b\n", ",")).toEqual([["a", "b"]]);
  });
});

describe("sniffDelimiter", () => {
  test("tab", () => expect(sniffDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t"));
  test("semicolon", () => expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";"));
  test("pipe", () => expect(sniffDelimiter("a|b|c\n1|2|3")).toBe("|"));
  test("comma default", () => expect(sniffDelimiter("a,b,c\n1,2,3")).toBe(","));
});

describe("parseJsonTable", () => {
  test("array of objects → header + rows", () => {
    const d = parseJsonTable('[{"a":1,"b":2},{"a":3,"b":4}]')!;
    expect(d.format).toBe("json-aoo");
    expect(d.hasHeader).toBe(true);
    expect(d.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("array of objects with ragged keys unions columns", () => {
    const d = parseJsonTable('[{"a":1},{"b":2}]')!;
    expect(d.rows).toEqual([
      ["a", "b"],
      ["1", ""],
      ["", "2"],
    ]);
  });

  test("array of arrays", () => {
    const d = parseJsonTable("[[1,2],[3,4]]")!;
    expect(d.format).toBe("json-aoa");
    expect(d.hasHeader).toBe(false);
    expect(d.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("JSONL of objects", () => {
    const d = parseJsonTable('{"a":1,"b":2}\n{"a":3,"b":4}')!;
    expect(d.format).toBe("jsonl");
    expect(d.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("non-JSON returns null", () => {
    expect(parseJsonTable("a,b,c")).toBeNull();
  });
});

describe("parseMarkdownTable", () => {
  test("pipe table with separator", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |";
    const d = parseMarkdownTable(md)!;
    expect(d.format).toBe("markdown");
    expect(d.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("not a table returns null", () => {
    expect(parseMarkdownTable("# heading\n\ntext")).toBeNull();
  });
});

describe("parseHtmlTable", () => {
  test("table with th header", () => {
    const html = "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>";
    const d = parseHtmlTable(html)!;
    expect(d.format).toBe("html");
    expect(d.hasHeader).toBe(true);
    expect(d.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCodeArray", () => {
  test("python list of lists", () => {
    const d = parseCodeArray("[[1, 2], [3, 4]]")!;
    expect(d.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("python list with strings and bools", () => {
    const d = parseCodeArray("[['a', True], ['b', False]]")!;
    expect(d.rows).toEqual([
      ["a", "true"],
      ["b", "false"],
    ]);
  });

  test("numpy array", () => {
    const d = parseCodeArray("np.array([[1, 2], [3, 4]])")!;
    expect(d.format).toBe("numpy");
    expect(d.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("matlab matrix", () => {
    const d = parseCodeArray("[1 2 3; 4 5 6]")!;
    expect(d.format).toBe("matlab");
    expect(d.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  test("c initialiser", () => {
    const d = parseCodeArray("{{1, 2}, {3, 4}}")!;
    expect(d.format).toBe("c");
    expect(d.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("guessHasHeader", () => {
  test("text header over numeric body", () => {
    expect(guessHasHeader([["name", "age"], ["bob", "30"]])).toBe(true);
  });
  test("numeric first row is not a header", () => {
    expect(guessHasHeader([["1", "2"], ["3", "4"]])).toBe(false);
  });
});

describe("detect orchestrator", () => {
  test("excel-style TSV paste", () => {
    const d = detect("Name\tQty\nApple\t3\nPear\t5");
    expect(d.delimiter).toBe("\t");
    expect(d.hasHeader).toBe(true);
    expect(d.rows.length).toBe(3);
  });

  test("html beats everything", () => {
    expect(detect("<table><tr><td>1</td></tr></table>").format).toBe("html");
  });

  test("respects .csv extension hint", () => {
    expect(detect("a,b\n1,2", "data.csv").delimiter).toBe(",");
  });

  test("numpy literal", () => {
    expect(detect("np.array([[1,2],[3,4]])").format).toBe("numpy");
  });
});

describe("reparseDelimited", () => {
  test("explicit semicolon + header override", () => {
    const d = reparseDelimited("a;b\n1;2", { delimiter: ";", hasHeader: true });
    expect(d.delimiter).toBe(";");
    expect(d.hasHeader).toBe(true);
    expect(d.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
