/**
 * Turns a {@link VNode} into a tag + attribute description that is shared by
 * two consumers:
 *   - the React <Canvas> (spreads the attrs onto a JSX SVG element), and
 *   - the SVG exporter / serialiser (stringifies them).
 *
 * Keeping one source of truth here means the on-screen render and the exported
 * file can never diverge.
 *
 * Tier 2 additions live behind optional style fields: gradient fills (emitted
 * as `<defs>` via {@link nodeDefsSvg}), dash patterns, caps/joins, arrow
 * markers, per-channel opacity, raster <image>, and multi-line <text>.
 */
import { getStroke } from "perfect-freehand";
import { localBBox } from "./geometry";
import type { Point, VNode } from "./types";

export interface SvgEl {
  tag: string;
  attrs: Record<string, string | number>;
  /** Text content for <text> nodes. */
  text?: string;
  /** For <text>: pre-split lines (multi-line support). */
  lines?: string[];
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

export const gradientId = (id: string) => `vgrad-${id}`;
const markerStartId = (id: string) => `vmk-s-${id}`;
const markerEndId = (id: string) => `vmk-e-${id}`;

function hasGradient(node: VNode): boolean {
  return !!node.fillGradient && node.fillGradient.stops.length >= 2;
}

/** Fill/stroke/opacity attributes common to every node. */
function styleAttrs(node: VNode, isFreehand: boolean): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  if (isFreehand) {
    // Freehand strokes are filled outlines painted with the stroke colour.
    attrs.fill = node.stroke ?? node.fill ?? "#000000";
    attrs.stroke = "none";
  } else {
    if (hasGradient(node)) {
      attrs.fill = `url(#${gradientId(node.id)})`;
    } else {
      attrs.fill = node.fill ?? "none";
    }
    if (node.stroke) {
      attrs.stroke = node.stroke;
      attrs["stroke-width"] = node.strokeWidth;
      attrs["stroke-linecap"] = node.strokeCap ?? "round";
      attrs["stroke-linejoin"] = node.strokeJoin ?? "round";
      if (node.strokeDash && node.strokeDash.length > 0) {
        attrs["stroke-dasharray"] = node.strokeDash.join(" ");
      }
      if (node.strokeOpacity != null && node.strokeOpacity < 1) {
        attrs["stroke-opacity"] = round(node.strokeOpacity);
      }
    } else {
      attrs.stroke = "none";
    }
    if (node.fillOpacity != null && node.fillOpacity < 1) {
      attrs["fill-opacity"] = round(node.fillOpacity);
    }
  }
  if (node.opacity !== 1) attrs.opacity = round(node.opacity);
  return attrs;
}

/** Attach marker-start/-end refs for open, stroked geometry. */
function withMarkers(node: VNode, attrs: Record<string, string | number>) {
  if (!node.stroke) return;
  if (node.markerStart && node.markerStart !== "none") attrs["marker-start"] = `url(#${markerStartId(node.id)})`;
  if (node.markerEnd && node.markerEnd !== "none") attrs["marker-end"] = `url(#${markerEndId(node.id)})`;
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
      withMarkers(node, attrs);
      if (transform) attrs.transform = transform;
      return { tag: "line", attrs };
    }
    case "polyline": {
      const attrs = {
        ...styleAttrs(node, false),
        points: polylineToPoints(node.points),
      } as Record<string, string | number>;
      if (!node.closed) withMarkers(node, attrs);
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
    case "image": {
      const attrs = {
        x: round(node.x),
        y: round(node.y),
        width: round(node.w),
        height: round(node.h),
        href: node.href,
        preserveAspectRatio: "none",
      } as Record<string, string | number>;
      if (node.opacity !== 1) attrs.opacity = round(node.opacity);
      if (transform) attrs.transform = transform;
      return { tag: "image", attrs };
    }
    case "text": {
      const attrs = {
        ...styleAttrs(node, false),
        x: round(node.x),
        y: round(node.y),
        "font-size": node.fontSize,
        "font-family": node.fontFamily,
      } as Record<string, string | number>;
      if (node.fontWeight && node.fontWeight !== 400) attrs["font-weight"] = node.fontWeight;
      if (node.fontStyle && node.fontStyle !== "normal") attrs["font-style"] = node.fontStyle;
      if (node.letterSpacing) attrs["letter-spacing"] = node.letterSpacing;
      if (node.align && node.align !== "left") {
        attrs["text-anchor"] = node.align === "center" ? "middle" : "end";
      }
      if (hasGradient(node)) attrs.fill = `url(#${gradientId(node.id)})`;
      else attrs.fill = node.fill ?? "#000000";
      attrs.stroke = "none";
      if (transform) attrs.transform = transform;
      return { tag: "text", attrs, text: node.text, lines: node.text.split("\n") };
    }
  }
}

// ─── Defs (gradients + markers) ───────────────────────────────────────────────

function gradientDef(node: VNode): string {
  const g = node.fillGradient;
  if (!g || g.stops.length < 2) return "";
  const id = gradientId(node.id);
  const stops = g.stops
    .map(
      (s) =>
        `<stop offset="${round(s.offset)}" stop-color="${s.color}"${
          s.opacity != null && s.opacity < 1 ? ` stop-opacity="${round(s.opacity)}"` : ""
        } />`,
    )
    .join("");
  if (g.type === "radial") {
    return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`;
  }
  const a = ((g.angle ?? 0) * Math.PI) / 180;
  // Unit vector → objectBoundingBox endpoints (0..1).
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const x1 = round(0.5 - dx / 2);
  const y1 = round(0.5 - dy / 2);
  const x2 = round(0.5 + dx / 2);
  const y2 = round(0.5 + dy / 2);
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}

function markerShape(kind: string, color: string): string {
  if (kind === "dot") {
    return `<circle cx="5" cy="5" r="4" fill="${color}" />`;
  }
  return `<path d="M0,0 L10,5 L0,10 z" fill="${color}" />`;
}

function markerDef(id: string, kind: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="strokeWidth">${markerShape(kind, color)}</marker>`;
}

/** All `<defs>` inner markup a single node needs (gradient + markers). */
export function nodeDefsSvg(node: VNode): string {
  let out = gradientDef(node);
  if (node.stroke) {
    if (node.markerStart && node.markerStart !== "none")
      out += markerDef(markerStartId(node.id), node.markerStart, node.stroke);
    if (node.markerEnd && node.markerEnd !== "none")
      out += markerDef(markerEndId(node.id), node.markerEnd, node.stroke);
  }
  return out;
}

/** Concatenated `<defs>` inner markup for a whole scene (empty when none). */
export function sceneDefsSvg(nodes: VNode[]): string {
  return nodes.map(nodeDefsSvg).join("");
}

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function textTspans(node: Extract<VNode, { type: "text" }>): string {
  const lines = node.text.split("\n");
  if (lines.length <= 1) return escapeXml(node.text);
  const lh = (node.lineHeight ?? 1.2) * node.fontSize;
  return lines
    .map((ln, i) => `<tspan x="${round(node.x)}" dy="${i === 0 ? 0 : round(lh)}">${escapeXml(ln)}</tspan>`)
    .join("");
}

/** Serialise one node to an SVG element string. */
export function nodeToSvgString(node: VNode): string {
  const el = nodeToSvgEl(node);
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");
  if (el.tag === "text" && node.type === "text") {
    return `<text ${attrs}>${textTspans(node)}</text>`;
  }
  if (el.tag === "image") {
    return `<image ${attrs} />`;
  }
  return `<${el.tag} ${attrs} />`;
}
