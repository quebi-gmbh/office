/**
 * Formula engine tests (phase 2.3).
 */
import { describe, expect, test } from "bun:test";
import { docFromRows } from "./model";
import { createWorkbook } from "./workbook";
import { FormulaEngine, CIRCULAR, ERROR, isFormula } from "./formula";

function wbFrom(rows: string[][], rows2?: string[][]) {
  const wb = createWorkbook("t");
  wb.sheets[0] = { ...docFromRows(rows, "Sheet1"), id: wb.sheets[0].id };
  if (rows2) wb.sheets.push({ ...docFromRows(rows2, "Sheet2"), id: "s2" });
  return wb;
}

const evalText = (rows: string[][], si = 0, r = 0, c = 0) =>
  new FormulaEngine(wbFrom(rows)).displayText(si, r, c);

describe("arithmetic + precedence", () => {
  test("plus/times", () => expect(evalText([["=1+2*3"]])).toBe("7"));
  test("parens", () => expect(evalText([["=(1+2)*3"]])).toBe("9"));
  test("power", () => expect(evalText([["=2^10"]])).toBe("1024"));
  test("unary minus", () => expect(evalText([["=-5+3"]])).toBe("-2"));
  test("divide by zero", () => expect(evalText([["=1/0"]])).toBe(ERROR));
});

describe("refs + ranges", () => {
  test("cell ref", () => {
    const wb = wbFrom([["5", "=A1*2"]]);
    expect(new FormulaEngine(wb).displayText(0, 0, 1)).toBe("10");
  });
  test("sum range", () => {
    const wb = wbFrom([["1"], ["2"], ["3"], ["=SUM(A1:A3)"]]);
    expect(new FormulaEngine(wb).displayText(0, 3, 0)).toBe("6");
  });
});

describe("functions", () => {
  test("IF", () => expect(evalText([["=IF(1>0,\"yes\",\"no\")"]])).toBe("yes"));
  test("CONCAT + string", () => expect(evalText([["=CONCAT(\"a\",\"b\",\"c\")"]])).toBe("abc"));
  test("ampersand concat", () => expect(evalText([["=\"x\"&1"]])).toBe("x1"));
  test("ROUND", () => expect(evalText([["=ROUND(3.14159,2)"]])).toBe("3.14"));
  test("UPPER/LEN", () => expect(evalText([["=LEN(UPPER(\"abc\"))"]])).toBe("3"));
  test("AND/OR", () => expect(evalText([["=AND(1,0)"]])).toBe("FALSE"));
});

describe("errors + cycles", () => {
  test("circular self-ref", () => {
    const wb = wbFrom([["=A1"]]);
    expect(new FormulaEngine(wb).displayText(0, 0, 0)).toBe(CIRCULAR);
  });
  test("mutual circular does not hang", () => {
    const wb = wbFrom([["=B1", "=A1"]]);
    const e = new FormulaEngine(wb);
    expect(e.displayText(0, 0, 0)).toBe(CIRCULAR);
  });
  test("unknown function", () => expect(evalText([["=BOGUS(1)"]])).toBe(ERROR));
});

describe("cross-sheet", () => {
  test("Sheet2!A1 reference", () => {
    const wb = wbFrom([["=Sheet2!A1+1"]], [["41"]]);
    expect(new FormulaEngine(wb).displayText(0, 0, 0)).toBe("42");
  });
});

describe("isFormula", () => {
  test("detects", () => {
    expect(isFormula("=1+1")).toBe(true);
    expect(isFormula("hello")).toBe(false);
    expect(isFormula("=")).toBe(false);
  });
});

describe("perf: 1k formulas", () => {
  test("recompute under 50ms", () => {
    const rows: string[][] = [["1"]];
    for (let i = 1; i < 1000; i++) rows.push([`=A${i}+1`]);
    const wb = wbFrom(rows);
    const e = new FormulaEngine(wb);
    const t = performance.now();
    const last = e.displayText(0, 999, 0);
    expect(performance.now() - t).toBeLessThan(50);
    expect(last).toBe("1000");
  });
});
