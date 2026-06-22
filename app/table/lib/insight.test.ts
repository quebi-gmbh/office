/**
 * Tests for phase 2.4: sparklines, conditional formatting, summary, custom expr.
 */
import { describe, expect, test } from "bun:test";
import { docFromRows } from "./model";
import { sparklineSvg, isSvgValue, SVG_MARKER } from "./sparkline";
import { decorate, precomputeStats, validateExpr, type CondRule } from "./condformat";
import { summarize } from "./summary";
import { evaluateExpression, isError, toBoolean } from "./formula";

describe("sparkline", () => {
  test("line svg", () => {
    const s = sparklineSvg([1, 2, 3], "line");
    expect(s).toContain("<svg");
    expect(s).toContain("polyline");
  });
  test("bar svg", () => {
    expect(sparklineSvg([1, 2], "bar")).toContain("<rect");
  });
  test("svg marker detection", () => {
    expect(isSvgValue(SVG_MARKER + "<svg/>")).toBe(true);
    expect(isSvgValue("hello")).toBe(false);
  });
});

describe("conditional formatting", () => {
  const doc = docFromRows([["1"], ["5"], ["10"]]);
  const range = { r0: 0, c0: 0, r1: 2, c1: 0 };

  test("colour scale assigns bg per value", () => {
    const rules: CondRule[] = [{ kind: "colorScale", range, stops: 2, colors: ["#ff0000", "#00ff00"] }];
    const stats = precomputeStats(doc, rules);
    const lo = decorate(doc, 0, 0, rules, stats);
    const hi = decorate(doc, 2, 0, rules, stats);
    expect(lo?.bg).toContain("rgb(255, 0, 0)");
    expect(hi?.bg).toContain("rgb(0, 255, 0)");
  });

  test("data bar fraction scales", () => {
    const rules: CondRule[] = [{ kind: "dataBar", range, color: "#2dd4a8" }];
    const stats = precomputeStats(doc, rules);
    expect(decorate(doc, 2, 0, rules, stats)?.bar).toBeCloseTo(1, 5);
    expect(decorate(doc, 0, 0, rules, stats)?.bar).toBeCloseTo(0.1, 5);
  });

  test("custom expression toggles fill", () => {
    const rules: CondRule[] = [{ kind: "custom", range, expr: "x > 4", color: "#123456" }];
    const stats = precomputeStats(doc, rules);
    expect(decorate(doc, 0, 0, rules, stats)?.bg).toBeUndefined();
    expect(decorate(doc, 1, 0, rules, stats)?.bg).toBe("#123456");
  });

  test("validateExpr flags bad syntax", () => {
    expect(validateExpr("x >")).not.toBeNull();
    expect(validateExpr("x > 5")).toBeNull();
  });
});

describe("summary", () => {
  test("numeric column stats", () => {
    const doc = docFromRows([["v"], ["1"], ["2"], ["3"], ["4"], [""]], "t", true);
    const s = summarize(doc, 0);
    expect(s.count).toBe(4);
    expect(s.nulls).toBe(1);
    expect(s.numeric).toBe(true);
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
    expect(s.mean).toBe(2.5);
    expect(s.median).toBe(2.5);
  });
  test("text column distinct + top", () => {
    const doc = docFromRows([["a"], ["a"], ["b"]]);
    const s = summarize(doc, 0);
    expect(s.distinct).toBe(2);
    expect(s.top[0]).toEqual({ value: "a", count: 2 });
  });
});

describe("evaluateExpression", () => {
  test("variable comparison", () => {
    const r = evaluateExpression("x > 10", { x: 20 });
    expect(isError(r)).toBe(false);
    expect(toBoolean(r)).toBe(true);
  });
});
