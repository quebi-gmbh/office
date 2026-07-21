/**
 * SVG import — parses an SVG document string into a {@link VectorScene}.
 *
 * Supports the common primitives (rect, circle, ellipse, line, polyline,
 * polygon, path, text). To handle arbitrary group/element transforms robustly
 * the parsed SVG is briefly attached to the DOM so we can read each element's
 * cumulative matrix via `getCTM()` and sample <path> geometry with
 * `getPointAtLength()`. Affine transforms are decomposed into
 * translate + rotate + scale (skew is dropped — acceptable for a Tier-1 MVP).
 */
import { newId } from "~/vector/lib/id";
import type { Point, Style, VNode, VectorScene } from "~/vector/lib/types";

const SUPPORTED = "rect,circle,ellipse,line,polyline,polygon,path,text,image";

interface Decomposed {
  tx: number;
  ty: number;
  rotation: number;
  sx: number;
  sy: number;
}

function decompose(m: DOMMatrix): Decomposed {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return { tx: m.e, ty: m.f, rotation, sx, sy };
}

function mapPoint(m: DOMMatrix, x: number, y: number): Point {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function styleProp(el: Element, name: string): string | null {
  // Inline `style="fill:..."` wins over the presentation attribute.
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(styleAttr);
    if (m) return m[1].trim();
  }
  return el.getAttribute(name);
}

/** Resolve fill/stroke/opacity, inheriting from ancestors like SVG does. */
function readStyle(el: Element): Style {
  const resolve = (name: string): string | null => {
    let cur: Element | null = el;
    while (cur && cur.nodeName.toLowerCase() !== "svg") {
      const v = styleProp(cur, name);
      if (v != null && v !== "") return v;
      cur = cur.parentElement;
    }
    return null;
  };
  const fillRaw = resolve("fill");
  const strokeRaw = resolve("stroke");
  const sw = resolve("stroke-width");
  const op = resolve("opacity");
  const norm = (c: string | null): string | null => {
    if (c == null) return undefined as unknown as string | null; // means "not set"
    if (c === "none" || c === "transparent") return null;
    return c;
  };
  const fill = fillRaw == null ? "#000000" : norm(fillRaw);
  const stroke = strokeRaw == null ? null : norm(strokeRaw);
  return {
    fill: fill === undefined ? "#000000" : fill,
    stroke: stroke === undefined ? null : stroke,
    strokeWidth: sw ? parseFloat(sw) || 1 : 1,
    opacity: op != null ? Math.max(0, Math.min(1, parseFloat(op))) : 1,
  };
}

function parsePoints(raw: string | null): Point[] {
  if (!raw) return [];
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function elementToNode(el: Element, ctm: DOMMatrix): VNode | null {
  const tag = el.nodeName.toLowerCase();
  const style = readStyle(el);
  const d = decompose(ctm);
  const base = { id: newId(), rotation: d.rotation, ...style };

  switch (tag) {
    case "rect": {
      const x = num(el, "x");
      const y = num(el, "y");
      const w = num(el, "width");
      const h = num(el, "height");
      const center = mapPoint(ctm, x + w / 2, y + h / 2);
      const nw = w * d.sx;
      const nh = h * d.sy;
      return {
        ...base,
        type: "rect",
        x: center[0] - nw / 2,
        y: center[1] - nh / 2,
        w: nw,
        h: nh,
        rx: Math.max(num(el, "rx"), num(el, "ry")) * d.sx,
      };
    }
    case "circle":
    case "ellipse": {
      const cx = num(el, "cx");
      const cy = num(el, "cy");
      const rx = tag === "circle" ? num(el, "r") : num(el, "rx");
      const ry = tag === "circle" ? num(el, "r") : num(el, "ry");
      const center = mapPoint(ctm, cx, cy);
      const nw = rx * 2 * d.sx;
      const nh = ry * 2 * d.sy;
      return {
        ...base,
        type: "ellipse",
        x: center[0] - nw / 2,
        y: center[1] - nh / 2,
        w: nw,
        h: nh,
      };
    }
    case "line": {
      const [x1, y1] = mapPoint(ctm, num(el, "x1"), num(el, "y1"));
      const [x2, y2] = mapPoint(ctm, num(el, "x2"), num(el, "y2"));
      return { ...base, rotation: 0, type: "line", x1, y1, x2, y2 };
    }
    case "polyline":
    case "polygon": {
      const pts = parsePoints(el.getAttribute("points")).map((p) => mapPoint(ctm, p[0], p[1]));
      if (pts.length < 2) return null;
      return { ...base, rotation: 0, type: "polyline", points: pts, closed: tag === "polygon" };
    }
    case "path": {
      const pathEl = el as SVGPathElement;
      let total = 0;
      try {
        total = pathEl.getTotalLength();
      } catch {
        return null;
      }
      if (!Number.isFinite(total) || total === 0) return null;
      const step = Math.max(2, total / 400);
      const pts: Point[] = [];
      for (let len = 0; len <= total; len += step) {
        const p = pathEl.getPointAtLength(len);
        pts.push(mapPoint(ctm, p.x, p.y));
      }
      const dAttr = el.getAttribute("d") ?? "";
      const closed = /z/i.test(dAttr);
      // Imported paths keep straight-segment fidelity as a poly-line/polygon.
      return {
        ...base,
        rotation: 0,
        type: "polyline",
        points: pts,
        closed: closed && style.fill != null,
      };
    }
    case "image": {
      const x = num(el, "x");
      const y = num(el, "y");
      const w = num(el, "width");
      const h = num(el, "height");
      const href = el.getAttribute("href") ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href) return null;
      const center = mapPoint(ctm, x + w / 2, y + h / 2);
      const nw = w * d.sx;
      const nh = h * d.sy;
      return {
        ...base,
        type: "image",
        x: center[0] - nw / 2,
        y: center[1] - nh / 2,
        w: nw,
        h: nh,
        href,
      };
    }
    case "text": {
      const [x, y] = mapPoint(ctm, num(el, "x"), num(el, "y"));
      const fs = parseFloat(styleProp(el, "font-size") ?? "16") || 16;
      return {
        ...base,
        type: "text",
        x,
        y,
        text: (el.textContent ?? "").trim(),
        fontSize: fs * d.sy,
        fontFamily: styleProp(el, "font-family") ?? "sans-serif",
        fill: style.fill ?? "#000000",
      };
    }
    default:
      return null;
  }
}

export interface ImportResult {
  scene: VectorScene;
}

/** Parse an SVG string into a scene. Returns null if it isn't valid SVG. */
export function importSvg(svgText: string): ImportResult | null {
  const parser = new DOMParser();
  const dom = parser.parseFromString(svgText, "image/svg+xml");
  const svg = dom.querySelector("svg");
  if (!svg || dom.querySelector("parsererror")) return null;

  // Determine document size.
  let width = parseFloat(svg.getAttribute("width") ?? "");
  let height = parseFloat(svg.getAttribute("height") ?? "");
  const viewBox = svg.getAttribute("viewBox");
  if ((!Number.isFinite(width) || !Number.isFinite(height)) && viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
      height = parts[3];
    }
  }
  if (!Number.isFinite(width) || width <= 0) width = 800;
  if (!Number.isFinite(height) || height <= 0) height = 600;

  // Attach to the DOM (hidden) so getCTM()/getPointAtLength() work.
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden";
  const live = svg.cloneNode(true) as SVGSVGElement;
  host.appendChild(live);
  document.body.appendChild(host);

  const nodes: VNode[] = [];
  try {
    const rootCtm = live.getScreenCTM();
    const els = live.querySelectorAll(SUPPORTED);
    els.forEach((el) => {
      const svgEl = el as SVGGraphicsElement;
      let ctm: DOMMatrix;
      try {
        const screen = svgEl.getScreenCTM();
        ctm = rootCtm && screen ? rootCtm.inverse().multiply(screen) : new DOMMatrix();
      } catch {
        ctm = new DOMMatrix();
      }
      const node = elementToNode(el, ctm);
      if (node) nodes.push(node);
    });
  } finally {
    document.body.removeChild(host);
  }

  return {
    scene: { doc: { width, height, background: "transparent" }, nodes },
  };
}
