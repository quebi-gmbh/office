import { describe, expect, test } from "bun:test";
import { createEngine } from "./engine";
import type { RectNode } from "./types";

function makeRect(id: string): RectNode {
  return {
    id,
    type: "rect",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    rx: 0,
    rotation: 0,
    fill: "#000",
    stroke: null,
    strokeWidth: 1,
    opacity: 1,
  };
}

describe("engine node lifecycle", () => {
  test("add + select + delete", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    expect(e.store.getSnapshot().nodes).toHaveLength(1);
    expect(e.store.getSnapshot().selection).toEqual(["a"]);
    e.deleteSelection();
    expect(e.store.getSnapshot().nodes).toHaveLength(0);
  });

  test("duplicate offsets and selects the copy", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.duplicateSelection();
    const s = e.store.getSnapshot();
    expect(s.nodes).toHaveLength(2);
    expect(s.nodes[1].id).not.toBe("a");
    expect((s.nodes[1] as RectNode).x).toBe(16);
    expect(s.selection).toEqual([s.nodes[1].id]);
  });
});

describe("engine history", () => {
  test("undo/redo restores scenes", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.addNode(makeRect("b"));
    expect(e.store.getSnapshot().nodes).toHaveLength(2);
    e.undo();
    expect(e.store.getSnapshot().nodes).toHaveLength(1);
    e.undo();
    expect(e.store.getSnapshot().nodes).toHaveLength(0);
    e.redo();
    expect(e.store.getSnapshot().nodes).toHaveLength(1);
  });

  test("canUndo/canRedo flags track state", () => {
    const e = createEngine();
    expect(e.store.getSnapshot().canUndo).toBe(false);
    e.addNode(makeRect("a"));
    expect(e.store.getSnapshot().canUndo).toBe(true);
    expect(e.store.getSnapshot().canRedo).toBe(false);
    e.undo();
    expect(e.store.getSnapshot().canRedo).toBe(true);
  });
});

describe("engine z-order", () => {
  test("bring to front / send to back", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.addNode(makeRect("b"));
    e.addNode(makeRect("c"));
    e.select(["a"]);
    e.bringToFront();
    expect(e.store.getSnapshot().nodes.map((n) => n.id)).toEqual(["b", "c", "a"]);
    e.select(["a"]);
    e.sendToBack();
    expect(e.store.getSnapshot().nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  test("bring forward swaps with the next-higher node", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.addNode(makeRect("b"));
    e.select(["a"]);
    e.bringForward();
    expect(e.store.getSnapshot().nodes.map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("engine clipboard", () => {
  test("copy + paste inserts an offset duplicate", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.copy();
    e.paste();
    const s = e.store.getSnapshot();
    expect(s.nodes).toHaveLength(2);
    expect((s.nodes[1] as RectNode).x).toBe(16);
  });

  test("cut removes original and keeps it pasteable", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.cut();
    expect(e.store.getSnapshot().nodes).toHaveLength(0);
    e.paste();
    expect(e.store.getSnapshot().nodes).toHaveLength(1);
  });
});

describe("engine styling", () => {
  test("applyStyle updates selection and defaults", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.applyStyle({ fill: "#ff0000", opacity: 0.5 });
    const s = e.store.getSnapshot();
    expect((s.nodes[0] as RectNode).fill).toBe("#ff0000");
    expect(s.nodes[0].opacity).toBe(0.5);
    expect(s.defaults.fill).toBe("#ff0000");
  });

  test("no-fill sets null", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.applyStyle({ fill: null });
    expect(e.store.getSnapshot().nodes[0].fill).toBeNull();
  });
});

describe("engine grouping & arrange", () => {
  function seed() {
    const e = createEngine();
    e.addNode({ ...makeRect("a"), x: 0, y: 0, w: 10, h: 10 });
    e.addNode({ ...makeRect("b"), x: 100, y: 50, w: 20, h: 20 });
    e.addNode({ ...makeRect("c"), x: 200, y: 200, w: 30, h: 10 });
    return e;
  }

  test("group tags selection with a shared id; ungroup clears it", () => {
    const e = seed();
    e.select(["a", "b"]);
    e.group();
    const g = e.store.getSnapshot().nodes.find((n) => n.id === "a")!.groupId;
    expect(g).toBeTruthy();
    expect(e.store.getSnapshot().nodes.find((n) => n.id === "b")!.groupId).toBe(g!);
    e.select(["a"]);
    e.ungroup();
    expect(e.store.getSnapshot().nodes.find((n) => n.id === "b")!.groupId).toBeFalsy();
  });

  test("align left moves every selected node to the group's left edge", () => {
    const e = seed();
    e.select(["a", "b", "c"]);
    e.align("left");
    const xs = e.store.getSnapshot().nodes.map((n) => (n as RectNode).x);
    expect(Math.min(...xs)).toBe(0);
    expect(xs.every((x) => x === 0)).toBe(true);
  });

  test("lock removes node from selection and flags it", () => {
    const e = seed();
    e.select(["a"]);
    e.setLocked(["a"], true);
    const s = e.store.getSnapshot();
    expect(s.nodes.find((n) => n.id === "a")!.locked).toBe(true);
    expect(s.selection).toEqual([]);
  });

  test("reorder moves a node to a new z-index", () => {
    const e = seed();
    e.reorder("a", 2);
    expect(e.store.getSnapshot().nodes.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  test("booleanOp union of two rects yields a closed polyline", () => {
    const e = createEngine();
    e.addNode({ ...makeRect("a"), x: 0, y: 0, w: 20, h: 20 });
    e.addNode({ ...makeRect("b"), x: 10, y: 10, w: 20, h: 20 });
    e.select(["a", "b"]);
    e.booleanOp("union");
    const s = e.store.getSnapshot();
    expect(s.nodes.some((n) => n.type === "rect")).toBe(false);
    expect(s.nodes.some((n) => n.type === "polyline")).toBe(true);
  });
});

describe("engine document", () => {
  test("newDocument resets nodes and history", () => {
    const e = createEngine();
    e.addNode(makeRect("a"));
    e.newDocument(400, 300, "transparent");
    const s = e.store.getSnapshot();
    expect(s.nodes).toHaveLength(0);
    expect(s.doc).toEqual({ width: 400, height: 300, background: "transparent" });
    expect(s.canUndo).toBe(false);
  });
});
