import { describe, expect, test } from "bun:test";
import { sceneFromJson, sceneToJson, sceneToSvg } from "./serialize";
import { nodeToSvgString } from "./render";
import type { VectorScene } from "./types";

const scene: VectorScene = {
  doc: { width: 200, height: 100, background: "#ffffff" },
  nodes: [
    {
      id: "r",
      type: "rect",
      x: 10,
      y: 10,
      w: 80,
      h: 40,
      rx: 4,
      rotation: 0,
      fill: "#4f46e5",
      stroke: "#111827",
      strokeWidth: 2,
      opacity: 0.8,
    },
    {
      id: "t",
      type: "text",
      x: 20,
      y: 60,
      text: "Hi & <there>",
      fontSize: 16,
      fontFamily: "sans-serif",
      rotation: 0,
      fill: "#000000",
      stroke: null,
      strokeWidth: 0,
      opacity: 1,
    },
  ],
};

describe("sceneToSvg", () => {
  test("produces a standalone SVG with background + nodes", () => {
    const svg = sceneToSvg(scene);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('width="200"');
    expect(svg).toContain("<rect");
    expect(svg).toContain('fill="#4f46e5"');
    expect(svg).toContain('rx="4"');
  });

  test("escapes text content", () => {
    const s = nodeToSvgString(scene.nodes[1]);
    expect(s).toContain("Hi &amp; &lt;there&gt;");
  });

  test("transparent background omits the backing rect", () => {
    const svg = sceneToSvg({ ...scene, doc: { ...scene.doc, background: "transparent" } });
    expect(svg).not.toContain('width="200" height="100" fill');
  });
});

describe("json round-trip", () => {
  test("serialise then parse preserves the scene", () => {
    const restored = sceneFromJson(sceneToJson(scene));
    expect(restored).toEqual(scene);
  });

  test("invalid json returns null", () => {
    expect(sceneFromJson("not json")).toBeNull();
    expect(sceneFromJson('{"foo":1}')).toBeNull();
  });
});
