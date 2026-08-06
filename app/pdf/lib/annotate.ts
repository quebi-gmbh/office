/**
 * Annotation layer — the data model behind the PDF tool's Draw mode, plus the
 * "burn it into the bytes" step.
 *
 * ## Coordinate space
 *
 * Annotations are stored in **view space**: the coordinate system of the page
 * as the user sees it, in PDF points, with the origin at the *top-left* and y
 * growing downwards — exactly what a pdf.js viewport at `scale: 1` produces
 * (including the page's `/Rotate`). That keeps the on-screen canvas trivial
 * (`css px = view pt × zoom`) and makes stored strokes independent of the zoom
 * level they were drawn at.
 *
 * Burning converts view space → PDF user space. Rather than transforming every
 * point, we lean on `page.drawSvgPath()`, which emits
 * `translate(x, y) · rotate(θ) · scale(1, -1)` before the path operators. For a
 * page whose CropBox is `(cx, cy, w, h)` and whose rotation is R, the anchor is:
 *
 *   R=0    → x = cx,     y = cy + h, θ = 0
 *   R=90   → x = cx,     y = cy,     θ = 90
 *   R=180  → x = cx + w, y = cy,     θ = 180
 *   R=270  → x = cx + w, y = cy + h, θ = 270
 *
 * which reproduces pdf.js' viewport transform exactly (see {@link viewToPdf}).
 *
 * ## Ink format
 *
 * Freehand ink is vector: perfect-freehand turns the pointer samples into a
 * filled outline polygon (so pressure varies the width), that outline becomes
 * an SVG path, and the path is drawn with `drawSvgPath`. Crisp at any zoom,
 * small files, real PDF content — no raster overlay.
 */
import { getStroke } from "perfect-freehand";
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

// ── Model ────────────────────────────────────────────────────────────────────

/** A pointer sample: `[x, y, pressure]` in view space / unit space. */
export type InkPoint = [x: number, y: number, pressure: number];

export type AnnotTool =
  | "pen"
  | "highlighter"
  | "eraser"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "signature";

/** Tools that actually produce an annotation (everything but the eraser). */
export type AnnotKind = Exclude<AnnotTool, "eraser">;

type Common = {
  id: string;
  /** 0-based page index. */
  page: number;
  /** Hex `#rrggbb`. */
  color: string;
  /** 0–1. */
  opacity: number;
};

export type InkAnnot = Common & {
  kind: "pen" | "highlighter";
  points: InkPoint[];
  /** Nib width in points. */
  width: number;
};

export type ShapeAnnot = Common & {
  kind: "line" | "arrow" | "rect" | "ellipse";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Outline width in points. */
  width: number;
  /** Hex fill for rect/ellipse, or null for outline-only. */
  fill: string | null;
};

export type TextAnnot = Common & {
  kind: "text";
  /** Top-left of the first line, view space. */
  x: number;
  y: number;
  text: string;
  /** Font size in points. */
  size: number;
};

export type SignatureAnnot = Common & {
  kind: "signature";
  /** Top-left of the placement box, view space. */
  x: number;
  y: number;
  /** Box width in points; height is `width × aspect`. */
  w: number;
  h: number;
  /** Strokes normalised to x ∈ [0,1], y ∈ [0,aspect]. */
  paths: InkPoint[][];
};

export type Annotation = InkAnnot | ShapeAnnot | TextAnnot | SignatureAnnot;

export function annotId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Page geometry needed to map view space ↔ PDF user space. */
export type PageBox = {
  /** CropBox origin in PDF user space. */
  x: number;
  y: number;
  /** CropBox size (unrotated). */
  width: number;
  height: number;
  /** `/Rotate`, normalised to 0 | 90 | 180 | 270. */
  rotation: number;
};

export function normalizeRotation(angle: number): number {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return a;
}

/** Size of the page as displayed (rotation applied), in points. */
export function viewSize(box: PageBox): { width: number; height: number } {
  return box.rotation === 90 || box.rotation === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
}

/**
 * Anchor + rotation to hand `drawSvgPath` so that a path authored in view
 * space lands correctly on the page. See the module docstring.
 */
export function pdfAnchor(box: PageBox): { x: number; y: number; rotate: number } {
  const { x, y, width: w, height: h } = box;
  switch (normalizeRotation(box.rotation)) {
    case 90:  return { x, y, rotate: 90 };
    case 180: return { x: x + w, y, rotate: 180 };
    case 270: return { x: x + w, y: y + h, rotate: 270 };
    default:  return { x, y: y + h, rotate: 0 };
  }
}

/** Map a view-space point to PDF user space (used for text + tests). */
export function viewToPdf(box: PageBox, vx: number, vy: number): { x: number; y: number } {
  const { x, y, width: w, height: h } = box;
  switch (normalizeRotation(box.rotation)) {
    case 90:  return { x: x + vy,     y: y + vx };
    case 180: return { x: x + w - vx, y: y + vy };
    case 270: return { x: x + w - vy, y: y + h - vx };
    default:  return { x: x + vx,     y: y + h - vy };
  }
}

/** Read per-page geometry (CropBox + rotation) for the whole document. */
export async function getPageBoxes(bytes: Uint8Array): Promise<PageBox[]> {
  const pdf = await loadPdfDoc(bytes);
  return pdf.getPages().map((page) => {
    const box = page.getCropBox();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rotation: normalizeRotation(page.getRotation().angle),
    };
  });
}

// ── Path generation ──────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 100) / 100;

/** Mouse pointers report a constant 0.5; that's our cue to simulate pressure. */
function needsSimulatedPressure(points: InkPoint[]): boolean {
  return points.every((p) => p[2] === 0.5 || p[2] === 0);
}

/**
 * Smooth filled outline for a freehand stroke, as SVG path data. Lifted from
 * the vector tool's `freehandPathData` and parameterised for the highlighter
 * (no thinning, flat caps).
 */
export function freehandPath(
  points: InkPoint[],
  size: number,
  opts: { thinning?: number; cap?: boolean } = {},
): string {
  if (points.length === 0) return "";
  const s = Math.max(0.5, size);
  const cap = opts.cap ?? true;
  const stroke = getStroke(points as unknown as number[][], {
    size: s,
    thinning: opts.thinning ?? 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: needsSimulatedPressure(points),
    last: true,
    start: { cap, taper: 0 },
    end: { cap, taper: 0 },
  });
  if (stroke.length < 2) {
    // Single tap — draw a dot.
    const [x, y] = points[0]!;
    const r = Math.max(0.5, s / 2);
    return `M ${round(x - r)} ${round(y)} a ${round(r)} ${round(r)} 0 1 0 ${round(r * 2)} 0 a ${round(r)} ${round(r)} 0 1 0 ${round(-r * 2)} 0 z`;
  }
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]!;
      acc.push(round(x0!), round(y0!), round((x0! + x1!) / 2), round((y0! + y1!) / 2));
      return acc;
    },
    ["M", round(stroke[0]![0]!), round(stroke[0]![1]!), "Q"] as (string | number)[],
  );
  d.push("Z");
  return d.join(" ");
}

/** Arrow head as a filled triangle at (x2,y2), pointing away from (x1,y1). */
function arrowHeadPath(a: ShapeAnnot): string {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return "";
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(len, Math.max(6, a.width * 4));
  const half = head * 0.42;
  const bx = a.x2 - ux * head;
  const by = a.y2 - uy * head;
  // Perpendicular.
  const px = -uy * half;
  const py = ux * half;
  return `M ${round(a.x2)} ${round(a.y2)} L ${round(bx + px)} ${round(by + py)} L ${round(bx - px)} ${round(by - py)} Z`;
}

const KAPPA = 0.5522847498307936;

function ellipsePath(a: ShapeAnnot): string {
  const cx = (a.x1 + a.x2) / 2;
  const cy = (a.y1 + a.y2) / 2;
  const rx = Math.abs(a.x2 - a.x1) / 2;
  const ry = Math.abs(a.y2 - a.y1) / 2;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const r = round;
  return [
    `M ${r(cx - rx)} ${r(cy)}`,
    `C ${r(cx - rx)} ${r(cy - oy)} ${r(cx - ox)} ${r(cy - ry)} ${r(cx)} ${r(cy - ry)}`,
    `C ${r(cx + ox)} ${r(cy - ry)} ${r(cx + rx)} ${r(cy - oy)} ${r(cx + rx)} ${r(cy)}`,
    `C ${r(cx + rx)} ${r(cy + oy)} ${r(cx + ox)} ${r(cy + ry)} ${r(cx)} ${r(cy + ry)}`,
    `C ${r(cx - ox)} ${r(cy + ry)} ${r(cx - rx)} ${r(cy + oy)} ${r(cx - rx)} ${r(cy)}`,
    "Z",
  ].join(" ");
}

function rectPath(a: ShapeAnnot): string {
  const x1 = round(Math.min(a.x1, a.x2));
  const y1 = round(Math.min(a.y1, a.y2));
  const x2 = round(Math.max(a.x1, a.x2));
  const y2 = round(Math.max(a.y1, a.y2));
  return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
}

/** Signature strokes mapped from unit space into the placement box. */
export function signatureStrokes(a: SignatureAnnot): InkPoint[][] {
  return a.paths.map((path) =>
    path.map(([px, py, pr]) => [a.x + px * a.w, a.y + py * a.w, pr] as InkPoint),
  );
}

/** Ink width used for a signature at a given box width. */
export function signatureInkWidth(boxWidth: number): number {
  return Math.max(0.8, boxWidth * 0.016);
}

/**
 * One drawable path. The live SVG overlay and the PDF burn both consume this,
 * so what you see is what gets written.
 */
export type PathSpec = {
  d: string;
  /** Hex fill, or null. */
  fill: string | null;
  /** Hex stroke, or null. */
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
  /** Highlighter ink multiplies rather than covers. */
  multiply: boolean;
};

/** Paths for an annotation. Text annotations render as text, so return []. */
export function annotPaths(a: Annotation): PathSpec[] {
  switch (a.kind) {
    case "pen":
      return [{
        d: freehandPath(a.points, a.width),
        fill: a.color, stroke: null, strokeWidth: 0,
        opacity: a.opacity, multiply: false,
      }];
    case "highlighter":
      return [{
        d: freehandPath(a.points, a.width, { thinning: 0, cap: false }),
        fill: a.color, stroke: null, strokeWidth: 0,
        opacity: a.opacity, multiply: true,
      }];
    case "signature": {
      const w = signatureInkWidth(a.w);
      return signatureStrokes(a).map((points) => ({
        d: freehandPath(points, w),
        fill: a.color, stroke: null, strokeWidth: 0,
        opacity: a.opacity, multiply: false,
      }));
    }
    case "line":
      return [{
        d: `M ${round(a.x1)} ${round(a.y1)} L ${round(a.x2)} ${round(a.y2)}`,
        fill: null, stroke: a.color, strokeWidth: a.width,
        opacity: a.opacity, multiply: false,
      }];
    case "arrow": {
      const specs: PathSpec[] = [{
        d: `M ${round(a.x1)} ${round(a.y1)} L ${round(a.x2)} ${round(a.y2)}`,
        fill: null, stroke: a.color, strokeWidth: a.width,
        opacity: a.opacity, multiply: false,
      }];
      const head = arrowHeadPath(a);
      if (head) {
        specs.push({
          d: head, fill: a.color, stroke: null, strokeWidth: 0,
          opacity: a.opacity, multiply: false,
        });
      }
      return specs;
    }
    case "rect":
      return [{
        d: rectPath(a),
        fill: a.fill, stroke: a.color, strokeWidth: a.width,
        opacity: a.opacity, multiply: false,
      }];
    case "ellipse":
      return [{
        d: ellipsePath(a),
        fill: a.fill, stroke: a.color, strokeWidth: a.width,
        opacity: a.opacity, multiply: false,
      }];
    default:
      return [];
  }
}

// ── Bounds + hit testing (eraser) ────────────────────────────────────────────

export type Bounds = { x1: number; y1: number; x2: number; y2: number };

export function annotBounds(a: Annotation): Bounds {
  switch (a.kind) {
    case "pen":
    case "highlighter": {
      const pad = a.width / 2;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [x, y] of a.points) {
        x1 = Math.min(x1, x); y1 = Math.min(y1, y);
        x2 = Math.max(x2, x); y2 = Math.max(y2, y);
      }
      if (!Number.isFinite(x1)) return { x1: 0, y1: 0, x2: 0, y2: 0 };
      return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
    }
    case "signature":
      return { x1: a.x, y1: a.y, x2: a.x + a.w, y2: a.y + a.h };
    case "text": {
      // Rough: 0.55em average advance, plus a line per newline.
      const lines = a.text.split("\n");
      const cols = Math.max(...lines.map((l) => l.length), 1);
      return {
        x1: a.x,
        y1: a.y,
        x2: a.x + cols * a.size * 0.55,
        y2: a.y + lines.length * a.size * 1.2,
      };
    }
    default: {
      const pad = a.width / 2;
      return {
        x1: Math.min(a.x1, a.x2) - pad,
        y1: Math.min(a.y1, a.y2) - pad,
        x2: Math.max(a.x1, a.x2) + pad,
        y2: Math.max(a.y1, a.y2) + pad,
      };
    }
  }
}

function distToSegment(
  px: number, py: number,
  x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Stroke-level eraser hit test: does the eraser tip at (x, y) with radius `r`
 * touch this annotation? Ink and lines test against the actual geometry;
 * everything else against its bounding box.
 */
export function hitTest(a: Annotation, x: number, y: number, r: number): boolean {
  const b = annotBounds(a);
  if (x < b.x1 - r || x > b.x2 + r || y < b.y1 - r || y > b.y2 + r) return false;
  switch (a.kind) {
    case "pen":
    case "highlighter": {
      const reach = r + a.width / 2;
      const pts = a.points;
      if (pts.length === 1) return Math.hypot(x - pts[0]![0], y - pts[0]![1]) <= reach;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1]!;
        const q = pts[i]!;
        if (distToSegment(x, y, p[0], p[1], q[0], q[1]) <= reach) return true;
      }
      return false;
    }
    case "line":
    case "arrow":
      return distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= r + a.width / 2;
    default:
      return true;
  }
}

/** Ids of every annotation on `page` the eraser tip touches. */
export function eraseHits(
  annots: Annotation[],
  page: number,
  x: number,
  y: number,
  r: number,
): string[] {
  return annots.filter((a) => a.page === page && hitTest(a, x, y, r)).map((a) => a.id);
}

// ── Signature normalisation ──────────────────────────────────────────────────

export type NormalizedSignature = {
  /** Strokes with x ∈ [0,1], y ∈ [0,aspect]. */
  paths: InkPoint[][];
  /** height / width of the captured ink. */
  aspect: number;
};

/**
 * Fit captured signature strokes into unit space: x spans exactly [0,1], y is
 * scaled by the same factor so the aspect ratio survives. Empty/degenerate
 * input yields an empty signature with aspect 0.4.
 */
export function normalizeSignature(paths: InkPoint[][]): NormalizedSignature {
  const pts = paths.flat();
  if (pts.length === 0) return { paths: [], aspect: 0.4 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of pts) {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y);
    x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  const w = x2 - x1;
  const h = y2 - y1;
  const scale = w > 0.001 ? 1 / w : 1;
  const aspect = w > 0.001 ? Math.max(0.02, h / w) : 0.4;
  return {
    paths: paths
      .filter((p) => p.length > 0)
      .map((path) => path.map(([x, y, p]) => [
        (x - x1) * scale,
        (y - y1) * scale,
        p,
      ] as InkPoint)),
    aspect,
  };
}

// ── Burn ─────────────────────────────────────────────────────────────────────

export function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * Helvetica (WinAnsi) can't encode every code point and pdf-lib throws when it
 * meets one. Replace anything outside Latin-1 so a stray emoji can't blow up
 * the whole burn.
 */
export function sanitizeWinAnsi(text: string): string {
  // Iterate code points, so an astral char (emoji) collapses to a single "?".
  return Array.from(text)
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      return c === 0x09 || c === 0x0a || (c >= 0x20 && c <= 0xff) ? ch : "?";
    })
    .join("");
}

/**
 * Burn the annotation layer into the document. Pure `bytes → bytes`, like
 * every other operation in `app/pdf/lib`.
 */
export async function burnAnnotations(
  bytes: Uint8Array,
  annots: Annotation[],
): Promise<Uint8Array> {
  if (annots.length === 0) return bytes;
  const { rgb, degrees, StandardFonts, BlendMode } = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  if (pdf.isEncrypted) {
    throw new Error("Can't draw on an encrypted PDF — remove the password first");
  }
  const pages = pdf.getPages();

  const byPage = new Map<number, Annotation[]>();
  for (const a of annots) {
    if (a.page < 0 || a.page >= pages.length) continue;
    const list = byPage.get(a.page);
    if (list) list.push(a);
    else byPage.set(a.page, [a]);
  }
  if (byPage.size === 0) return bytes;

  let font: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
  const needsFont = annots.some((a) => a.kind === "text" && a.text.trim() !== "");
  if (needsFont) font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const [pageIndex, list] of byPage) {
    const page = pages[pageIndex]!;
    const crop = page.getCropBox();
    const box: PageBox = {
      x: crop.x,
      y: crop.y,
      width: crop.width,
      height: crop.height,
      rotation: normalizeRotation(page.getRotation().angle),
    };
    const anchor = pdfAnchor(box);

    for (const a of list) {
      if (a.kind === "text") {
        if (!font || a.text.trim() === "") continue;
        const [r, g, b] = hexToRgb01(a.color);
        const lines = sanitizeWinAnsi(a.text).split("\n");
        lines.forEach((line, i) => {
          if (line === "") return;
          // View-space baseline of this line (y grows down).
          const baselineY = a.y + a.size * (0.8 + i * 1.2);
          const p = viewToPdf(box, a.x, baselineY);
          page.drawText(line, {
            x: p.x,
            y: p.y,
            size: a.size,
            font: font!,
            color: rgb(r, g, b),
            opacity: a.opacity,
            rotate: degrees(box.rotation),
          });
        });
        continue;
      }

      for (const spec of annotPaths(a)) {
        if (!spec.d) continue;
        const opts: Parameters<typeof page.drawSvgPath>[1] = {
          x: anchor.x,
          y: anchor.y,
          rotate: degrees(anchor.rotate),
          opacity: spec.opacity,
          borderOpacity: spec.opacity,
        };
        if (spec.fill) {
          const [r, g, b] = hexToRgb01(spec.fill);
          opts.color = rgb(r, g, b);
        }
        if (spec.stroke && spec.strokeWidth > 0) {
          const [r, g, b] = hexToRgb01(spec.stroke);
          opts.borderColor = rgb(r, g, b);
          opts.borderWidth = spec.strokeWidth;
        }
        if (spec.multiply) opts.blendMode = BlendMode.Multiply;
        if (!opts.color && !opts.borderColor) continue;
        page.drawSvgPath(spec.d, opts);
      }
    }
  }

  return savePdfDoc(pdf);
}
