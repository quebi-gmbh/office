import { describe, expect, test } from "bun:test";
import { buildOps } from "./build";
import { createBox, createExtrude, createSketch, newDoc } from "./factory";
import type { CadDoc } from "./types";

describe("buildOps", () => {
  test("primitive becomes a box op", () => {
    const doc = newDoc();
    doc.features.push(createBox());
    const { ops } = buildOps(doc);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind.type).toBe("box");
  });

  test("suppressed features are skipped", () => {
    const doc = newDoc();
    const box = createBox();
    box.suppressed = true;
    doc.features.push(box);
    expect(buildOps(doc).ops).toHaveLength(0);
  });

  test("extrude of a rectangle sketch produces an extrude op with polygons", () => {
    const doc: CadDoc = newDoc();
    const sk = createSketch("XY");
    sk.sketch.entities.push({ id: "r", type: "rect", x: 0, y: 0, w: 10, h: 10 });
    doc.features.push(sk);
    const ex = createExtrude(sk.id);
    doc.features.push(ex);
    const { ops, warnings } = buildOps(doc);
    expect(warnings).toHaveLength(0);
    const extrude = ops.find((o) => o.kind.type === "extrude");
    expect(extrude).toBeDefined();
    if (extrude?.kind.type === "extrude") {
      expect(extrude.kind.polygons.length).toBeGreaterThan(0);
      expect(extrude.kind.height).toBe(ex.depth);
    }
  });

  test("extrude of an empty sketch warns instead of emitting an op", () => {
    const doc = newDoc();
    const sk = createSketch("XY");
    doc.features.push(sk);
    doc.features.push(createExtrude(sk.id));
    const { ops, warnings } = buildOps(doc);
    expect(ops).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
