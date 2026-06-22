/**
 * Tests for phase 2.1: workbook migration + sheet ops, and fill series.
 */
import { describe, expect, test } from "bun:test";
import { docFromRows } from "./model";
import {
  toWorkbook,
  createWorkbook,
  addSheet,
  deleteSheet,
  duplicateSheet,
  moveSheet,
  activeSheet,
} from "./workbook";
import { fillSeries } from "./fill";

describe("workbook migration", () => {
  test("wraps a legacy TableDoc as sheets[0]", () => {
    const legacy = docFromRows([["a"], ["1"]], "MyData");
    const wb = toWorkbook(legacy);
    expect(wb.version).toBe(2);
    expect(wb.sheets.length).toBe(1);
    expect(wb.name).toBe("MyData");
    expect(wb.sheets[0].name).toBe("Sheet1");
    expect(wb.sheets[0].id).toBeTruthy();
    expect(activeSheet(wb).cols[0][1]).toBe("1");
  });

  test("passes through a v2 workbook + backfills ids", () => {
    const wb = createWorkbook("T");
    const round = toWorkbook(JSON.parse(JSON.stringify(wb)));
    expect(round.version).toBe(2);
    expect(round.sheets[0].id).toBeTruthy();
  });
});

describe("sheet ops", () => {
  test("add / delete keeps ≥1 sheet", () => {
    let wb = createWorkbook();
    wb = addSheet(wb);
    expect(wb.sheets.length).toBe(2);
    expect(wb.active).toBe(1);
    wb = deleteSheet(wb, 1);
    expect(wb.sheets.length).toBe(1);
    expect(deleteSheet(wb, 0).sheets.length).toBe(1); // can't delete last
  });

  test("duplicate deep-copies cells", () => {
    let wb = createWorkbook();
    wb.sheets[0].cols[0] = ["hi"];
    wb = duplicateSheet(wb, 0);
    expect(wb.sheets.length).toBe(2);
    wb.sheets[1].cols[0][0] = "changed";
    expect(wb.sheets[0].cols[0][0]).toBe("hi"); // original untouched
  });

  test("move reorders and tracks active", () => {
    let wb = addSheet(addSheet(createWorkbook())); // 3 sheets, active=2
    wb = moveSheet(wb, 2, 0);
    expect(wb.active).toBe(0);
  });
});

describe("fill series", () => {
  test("numeric step", () => expect(fillSeries(["1", "2"], 3)).toEqual(["3", "4", "5"]));
  test("numeric step of 2", () => expect(fillSeries(["2", "4"], 2)).toEqual(["6", "8"]));
  test("weekday names", () => expect(fillSeries(["Mon", "Tue"], 2)).toEqual(["Wed", "Thu"]));
  test("month names", () => expect(fillSeries(["January"], 1)).toEqual(["February"]));
  test("iso dates", () => expect(fillSeries(["2025-01-01", "2025-01-02"], 2)).toEqual(["2025-01-03", "2025-01-04"]));
  test("padded prefix", () => expect(fillSeries(["item-001", "item-002"], 2)).toEqual(["item-003", "item-004"]));
  test("copy fallback", () => expect(fillSeries(["x", "y"], 3)).toEqual(["x", "y", "x"]));
  test("single number increments by 1", () => expect(fillSeries(["5"], 2)).toEqual(["6", "7"]));
});
