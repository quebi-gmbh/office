/**
 * Turns a {@link VNode} into a tag + attribute description that is shared by
 * two consumers:
 *   - the React <Canvas> (spreads the attrs onto a JSX SVG element), and
 *   - the SVG exporter / serialiser (stringifies them).
 *
 * Keeping one source of truth here means the on-screen render and the exported
 * file can never diverge.
 */
import { getStroke } from "perfect-freehand";
import { localBBox } from "./geometry";
import type { Point, VNode } from "./types";

export interface SvgEl {
  tag: string;
  attrs: Record<string, string | number>;
  /** Text content for <text> nodes. */
  text?: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Build the smooth filled outline `d` for a freehand stroke. */
export function freehandPathData(points: Point[], size: number): string {
  if (points.length === 0) return "";
  const stroke = getStroke(points, {
    size: Math.max(1, size),
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
    last: true,
  });
  if (stroke.length < 2) {
    // A single dot — draw a small circle-ish blob.
    const [x, y] = points[0];
    const r = Math.max(1, size / 2);
    return `M ${round(x - r)} ${round(y)} a ${round(r)} ${round(r)} 0 1 0 ${round(r * 2)} 0 a ${round(r)} ${round(r)} 0 1 0 ${round(-r * 2)} 0 z`;
  }
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(round(x0), round(y0), round((x0 + x1) / 2), round((y0 + y1) / 2));
      return acc;
    },
    ["M", round(stroke[0][0]), round(stroke[0][1]), "Q"] as (string | number)[],
  );
  d.push("Z");
  return d.join(" ");
}

function polylineToPoints(points: Point[]): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

/** Rotation transform string (empty when the node isn't rotated). */
export function rotationTransform(node: VNode): string | undefined {
  if (!node.rotation) return undefined;
  const b = localBBox(node);
  const cx = round(b.x + b.w / 2);
  const cy = round(b.y + b.h / 2);
  return `rotate(${round(node.rotation)} ${cx} ${cy})`;
}

/** Fill/stroke/opacity attributes common to every node. */
function styleAttrs(node: VNode, isFreehand: boolean): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (isFreehand) {
    // Freehand strokes are filled outlines painted with the stroke colour.
    attrs.fill = node.stroke ?? node.fill ?? "#000000";
    attrs.stroke = "none";
  } else {
    attrs.fill = node.fill ?? "none";
    if (node.stroke) {
      attrs.stroke = node.stroke;
      attrs["stroke-width"] = node.strokeWidth;
      attrs["stroke-linecap"] = "round";
      attrs["stroke-linejoin"] = "round";
    } else {
      attrs.stroke = "none";
    }
  }
  if (node.opacity !== 1) attrs.opacity = round(node.opacity);
  return attrs;
}

/** Describe a node as an SVG element (tag + attrs), sans transform grouping. */
export function nodeToSvgEl(node: VNode): SvgEl {
  const transform = rotationTransform(node);
  switch (node.type) {
    case "rect": {
      const attrs = {
        ...styleAttrs(node, false),
        x: round(node.x),
        y: round(node.y),
        width: round(node.w),
        height: round(node.h),
      } as Record<string, string | number>;
      if (node.rx > 0) attrs.rx = round(node.rx);
      if (transform) attrs.transform = transform;
      return { tag: "rect", attrs };
    }
    case "ellipse": {
      const attrs = {
        ...styleAttrs(node, false),
        cx: round(node.x + node.w / 2),
        cy: round(node.y + node.h / 2),
        rx: round(node.w / 2),
        ry: round(node.h / 2),
      } as Record<string, string | number>;
      if (transform) attrs.transform = transform;
      return { tag: "ellipse", attrs };
    }
    case "line": {
      const attrs = {
        ...styleAttrs(node, false),
        x1: round(node.x1),
        y1: round(node.y1),
        x2: round(node.x2),
        y2: round(node.y2),
      } as Record<string, string | number>;
      delete attrs.fill;
      if (transform) attrs.transform = transform;
      return { tag: "line", attrs };
    }
    case "polyline": {
      const attrs = {
        ...styleAttrs(node, false),
        points: polylineToPoints(node.points),
      } as Record<string, string | number>;
      if (transform) attrs.transform = transform;
      return { tag: node.closed ? "polygon" : "polyline", attrs };
    }
    case "path": {
      const attrs = {
        ...styleAttrs(node, true),
        d: freehandPathData(node.points, node.strokeWidth),
      } as Record<string, string | number>;
      if (transform) attrs.transform = transform;
      return { tag: "path", attrs };
    }
    case "text": {
      const attrs = {
        ...styleAttrs(node, false),
        x: round(node.x),
        y: round(node.y),
        "font-size": node.fontSize,
        "font-family": node.fontFamily,
      } as Record<string, string | number>;
      attrs.fill = node.fill ?? "#000000";
      attrs.stroke = "none";
      if (transform) attrs.transform = transform;
      return { tag: "text", attrs, text: node.text };
    }
  }
}

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Serialise one node to an SVG element string. */
export function nodeToSvgString(node: VNode): string {
  const el = nodeToSvgEl(node);
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");
  if (el.tag === "text") {
    return `<text ${attrs}>${escapeXml(el.text ?? "")}</text>`;
  }
  return `<${el.tag} ${attrs} />`;
}
