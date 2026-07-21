import { describe, expect, test } from "bun:test";
import { sceneToSvg } from "./serialize";
import { nodeToSvgString } from "./render";
import { encodeSceneToHash, decodeSceneFromHash } from "~/vector/io/share";
import type { VNode, VectorScene } from "./types";

function scene(nodes: VNode[]): VectorScene {
  return { doc: { width: 200, height: 100, background: "transparent" }, nodes };
}

describe("Tier 2 serialisation", () => {
  test("gradient fill emits a <defs> linearGradient and url() reference", () => {
    const rect: VNode = {
      id: "g", type: "rect", x: 0, y: 0, w: 100, h: 50, rx: 0, rotation: 0,
      fill: "#000", stroke: null, strokeWidth: 0, opacity: 1,
      fillGradient: { type: "linear", angle: 90, stops: [{ offset: 0, color: "#f00" }, { offset: 1, color: "#00f" }] },
    };
    const svg = sceneToSvg(scene([rect]));
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("url(#vgrad-g)");
    expect(svg).toContain('stop-color="#f00"');
  });

  test("arrow marker end emits a <marker> and marker-end ref", () => {
    const line: VNode = {
      id: "l", type: "line", x1: 0, y1: 0, x2: 100, y2: 0, rotation: 0,
      fill: null, stroke: "#111", strokeWidth: 2, opacity: 1, markerEnd: "arrow",
    };
    const svg = sceneToSvg(scene([line]));
    expect(svg).toContain("<marker");
    expect(svg).toContain("marker-end=");
  });

  test("multi-line text serialises to tspans", () => {
    const t: VNode = {
      id: "t", type: "text", x: 5, y: 20, text: "line one\nline two", fontSize: 12, fontFamily: "serif",
      rotation: 0, fill: "#000", stroke: null, strokeWidth: 0, opacity: 1, lineHeight: 1.5,
    };
    const s = nodeToSvgString(t);
    expect(s.match(/<tspan/g)?.length).toBe(2);
    expect(s).toContain("line one");
    expect(s).toContain("line two");
  });

  test("dash pattern serialises to stroke-dasharray", () => {
    const rect: VNode = {
      id: "d", type: "rect", x: 0, y: 0, w: 10, h: 10, rx: 0, rotation: 0,
      fill: "#000", stroke: "#111", strokeWidth: 2, opacity: 1, strokeDash: [8, 6],
    };
    expect(nodeToSvgString(rect)).toContain('stroke-dasharray="8 6"');
  });

  test("crop shrinks the viewBox around the selection", () => {
    const rect: VNode = {
      id: "r", type: "rect", x: 50, y: 30, w: 20, h: 20, rx: 0, rotation: 0,
      fill: "#000", stroke: null, strokeWidth: 0, opacity: 1,
    };
    const svg = sceneToSvg(scene([rect]), { crop: [rect], margin: 0 });
    expect(svg).toContain('viewBox="50 30 20 20"');
  });

  test("image node serialises to an <image> element", () => {
    const img: VNode = {
      id: "i", type: "image", x: 0, y: 0, w: 40, h: 40, href: "data:image/png;base64,AAAA",
      rotation: 0, fill: null, stroke: null, strokeWidth: 0, opacity: 1,
    };
    expect(nodeToSvgString(img)).toContain("<image");
  });
});

describe("share-by-URL round trip", () => {
  test("encode → decode preserves the scene", () => {
    const s = scene([
      { id: "r", type: "rect", x: 1, y: 2, w: 3, h: 4, rx: 0, rotation: 0, fill: "#abc", stroke: null, strokeWidth: 1, opacity: 1 },
    ]);
    const hash = encodeSceneToHash(s);
    expect(hash.startsWith("#s=")).toBe(true);
    expect(decodeSceneFromHash(hash)).toEqual(s);
  });

  test("non-share hash returns null", () => {
    expect(decodeSceneFromHash("#other")).toBeNull();
  });
});
