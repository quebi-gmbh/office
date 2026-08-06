import { describe, expect, test } from "bun:test";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import {
  annotBounds, annotPaths, burnAnnotations, eraseHits, freehandPath,
  getPageBoxes, hexToRgb01, hitTest, normalizeRotation, normalizeSignature,
  pdfAnchor, sanitizeWinAnsi, signatureStrokes, viewSize, viewToPdf,
  type Annotation, type InkAnnot, type InkPoint, type PageBox,
} from "./annotate";

const A4: PageBox = { x: 0, y: 0, width: 595, height: 842, rotation: 0 };

function pen(over: Partial<InkAnnot> = {}): InkAnnot {
  return {
    id: "a1", page: 0, kind: "pen", color: "#112233", opacity: 1, width: 3,
    points: [[10, 10, 0.5], [40, 40, 0.5], [80, 20, 0.5]],
    ...over,
  };
}

// ── Coordinate transform ─────────────────────────────────────────────────────

describe("view ↔ PDF coordinates", () => {
  test("normalizeRotation folds arbitrary angles into 0/90/180/270", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
  });

  test("viewSize swaps for quarter turns", () => {
    expect(viewSize(A4)).toEqual({ width: 595, height: 842 });
    expect(viewSize({ ...A4, rotation: 90 })).toEqual({ width: 842, height: 595 });
    expect(viewSize({ ...A4, rotation: 180 })).toEqual({ width: 595, height: 842 });
    expect(viewSize({ ...A4, rotation: 270 })).toEqual({ width: 842, height: 595 });
  });

  test("unrotated: top-left of the view is the top-left of the page", () => {
    expect(viewToPdf(A4, 0, 0)).toEqual({ x: 0, y: 842 });
    expect(viewToPdf(A4, 595, 842)).toEqual({ x: 595, y: 0 });
  });

  test("every rotation keeps the view corners inside the page box", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const box = { ...A4, rotation };
      const v = viewSize(box);
      for (const [vx, vy] of [[0, 0], [v.width, 0], [0, v.height], [v.width, v.height]]) {
        const p = viewToPdf(box, vx!, vy!);
        expect(p.x).toBeGreaterThanOrEqual(-0.001);
        expect(p.x).toBeLessThanOrEqual(box.width + 0.001);
        expect(p.y).toBeGreaterThanOrEqual(-0.001);
        expect(p.y).toBeLessThanOrEqual(box.height + 0.001);
      }
    }
  });

  test("a non-zero CropBox origin offsets the mapping", () => {
    const box: PageBox = { x: 20, y: 30, width: 500, height: 700, rotation: 0 };
    expect(viewToPdf(box, 0, 0)).toEqual({ x: 20, y: 730 });
    expect(viewToPdf(box, 10, 700)).toEqual({ x: 30, y: 30 });
  });

  test("pdfAnchor reproduces drawSvgPath's translate·rotate·scale(1,-1)", () => {
    // drawSvgPath maps a path point (sx, sy) to
    //   (ax + cosθ·sx + sinθ·sy, ay + sinθ·sx - cosθ·sy)
    // which must equal viewToPdf for every rotation.
    for (const rotation of [0, 90, 180, 270]) {
      const box = { ...A4, rotation };
      const a = pdfAnchor(box);
      const rad = (a.rotate * Math.PI) / 180;
      const cos = Math.round(Math.cos(rad));
      const sin = Math.round(Math.sin(rad));
      for (const [vx, vy] of [[0, 0], [123, 45], [400, 700]]) {
        const viaSvg = {
          x: a.x + cos * vx! + sin * vy!,
          y: a.y + sin * vx! - cos * vy!,
        };
        const direct = viewToPdf(box, vx!, vy!);
        expect(viaSvg.x).toBeCloseTo(direct.x, 6);
        expect(viaSvg.y).toBeCloseTo(direct.y, 6);
      }
    }
  });
});

// ── Path generation ──────────────────────────────────────────────────────────

describe("path generation", () => {
  test("a freehand stroke becomes a closed outline path", () => {
    const d = freehandPath([[0, 0, 0.5], [10, 10, 0.5], [20, 0, 0.5]], 4);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.trimEnd().endsWith("Z")).toBe(true);
    expect(d).toContain("Q");
  });

  test("a single tap still produces a visible blob", () => {
    const d = freehandPath([[5, 5, 0.5]], 6);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.trimEnd().endsWith("Z")).toBe(true);
    expect(d.length).toBeGreaterThan(20);
  });

  test("no points → empty path", () => {
    expect(freehandPath([], 4)).toBe("");
  });

  test("pen ink is filled, never stroked", () => {
    const [spec] = annotPaths(pen());
    expect(spec!.fill).toBe("#112233");
    expect(spec!.stroke).toBeNull();
    expect(spec!.multiply).toBe(false);
  });

  test("highlighter ink multiplies", () => {
    const [spec] = annotPaths(pen({ kind: "highlighter", color: "#fde047" }));
    expect(spec!.multiply).toBe(true);
    expect(spec!.fill).toBe("#fde047");
  });

  test("an arrow emits a stroked shaft plus a filled head", () => {
    const specs = annotPaths({
      id: "s", page: 0, kind: "arrow", color: "#000000", opacity: 1,
      x1: 0, y1: 0, x2: 100, y2: 0, width: 2, fill: null,
    });
    expect(specs).toHaveLength(2);
    expect(specs[0]!.stroke).toBe("#000000");
    expect(specs[0]!.fill).toBeNull();
    expect(specs[1]!.fill).toBe("#000000");
    expect(specs[1]!.d).toContain("Z");
  });

  test("rect honours the fill option", () => {
    const base = {
      id: "s", page: 0, kind: "rect" as const, color: "#000000", opacity: 1,
      x1: 10, y1: 10, x2: 50, y2: 30, width: 1,
    };
    expect(annotPaths({ ...base, fill: null })[0]!.fill).toBeNull();
    expect(annotPaths({ ...base, fill: "#ff0000" })[0]!.fill).toBe("#ff0000");
  });

  test("ellipse is four cubic segments", () => {
    const d = annotPaths({
      id: "s", page: 0, kind: "ellipse", color: "#000000", opacity: 1,
      x1: 0, y1: 0, x2: 100, y2: 50, width: 1, fill: null,
    })[0]!.d;
    expect(d.match(/C /g)).toHaveLength(4);
  });

  test("text annotations produce no paths (they're drawn as text)", () => {
    expect(annotPaths({
      id: "t", page: 0, kind: "text", color: "#000000", opacity: 1,
      x: 10, y: 10, text: "hi", size: 12,
    })).toHaveLength(0);
  });
});

// ── Eraser ───────────────────────────────────────────────────────────────────

describe("eraser hit testing", () => {
  test("bounds cover the stroke plus half the nib", () => {
    const b = annotBounds(pen());
    expect(b.x1).toBeCloseTo(8.5, 5);
    expect(b.x2).toBeCloseTo(81.5, 5);
  });

  test("a tip on the stroke hits, one far away misses", () => {
    const a = pen();
    expect(hitTest(a, 25, 25, 2)).toBe(true);
    expect(hitTest(a, 300, 300, 2)).toBe(false);
    // Inside the bounding box but nowhere near the ink.
    expect(hitTest(a, 78, 40, 1)).toBe(false);
  });

  test("eraseHits only returns annotations on the given page", () => {
    const annots = [pen(), pen({ id: "a2", page: 1 })];
    expect(eraseHits(annots, 0, 25, 25, 3)).toEqual(["a1"]);
    expect(eraseHits(annots, 1, 25, 25, 3)).toEqual(["a2"]);
    expect(eraseHits(annots, 2, 25, 25, 3)).toEqual([]);
  });

  test("lines are tested against the segment, not the box", () => {
    const line: Annotation = {
      id: "l", page: 0, kind: "line", color: "#000000", opacity: 1,
      x1: 0, y1: 0, x2: 100, y2: 100, width: 1, fill: null,
    };
    expect(hitTest(line, 50, 50, 2)).toBe(true);
    expect(hitTest(line, 90, 10, 2)).toBe(false);
  });
});

// ── Signatures ───────────────────────────────────────────────────────────────

describe("signatures", () => {
  const captured: InkPoint[][] = [
    [[100, 50, 0.5], [200, 100, 0.5]],
    [[150, 75, 0.5], [300, 150, 0.5]],
  ];

  test("normalisation fits x into [0,1] and preserves aspect", () => {
    const n = normalizeSignature(captured);
    const xs = n.paths.flat().map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(1, 6);
    expect(n.aspect).toBeCloseTo(0.5, 6); // 100 tall over 200 wide
  });

  test("empty capture degrades gracefully", () => {
    const n = normalizeSignature([]);
    expect(n.paths).toEqual([]);
    expect(n.aspect).toBeGreaterThan(0);
  });

  test("stamping maps unit strokes into the placement box", () => {
    const n = normalizeSignature(captured);
    const strokes = signatureStrokes({
      id: "s", page: 0, kind: "signature", color: "#000000", opacity: 1,
      x: 50, y: 400, w: 200, h: 200 * n.aspect, paths: n.paths,
    });
    const flat = strokes.flat();
    expect(Math.min(...flat.map((p) => p[0]))).toBeCloseTo(50, 5);
    expect(Math.max(...flat.map((p) => p[0]))).toBeCloseTo(250, 5);
    expect(Math.min(...flat.map((p) => p[1]))).toBeCloseTo(400, 5);
    expect(Math.max(...flat.map((p) => p[1]))).toBeCloseTo(500, 5);
  });
});

// ── Misc helpers ─────────────────────────────────────────────────────────────

describe("helpers", () => {
  test("hexToRgb01", () => {
    expect(hexToRgb01("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToRgb01("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb01("nope")).toEqual([0, 0, 0]);
  });

  test("sanitizeWinAnsi replaces unencodable code points", () => {
    expect(sanitizeWinAnsi("héllo")).toBe("héllo");
    expect(sanitizeWinAnsi("hi 👋")).toBe("hi ?");
    expect(sanitizeWinAnsi("a\nb")).toBe("a\nb");
  });
});

// ── Burn ─────────────────────────────────────────────────────────────────────

async function samplePdf(rotation = 0, pages = 2): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([595, 842]);
    if (rotation) page.setRotation(degrees(rotation));
  }
  return pdf.save({ useObjectStreams: false });
}

describe("burnAnnotations", () => {
  test("no annotations → the same bytes back", async () => {
    const bytes = await samplePdf();
    expect(await burnAnnotations(bytes, [])).toBe(bytes);
  });

  test("getPageBoxes reports CropBox + rotation per page", async () => {
    const boxes = await getPageBoxes(await samplePdf(90));
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toEqual({ x: 0, y: 0, width: 595, height: 842, rotation: 90 });
    expect(viewSize(boxes[0]!)).toEqual({ width: 842, height: 595 });
  });

  test("ink is written into the page content stream", async () => {
    const bytes = await samplePdf();
    const out = await burnAnnotations(bytes, [pen()]);
    expect(out.byteLength).toBeGreaterThan(bytes.byteLength);
    // Reloading proves we produced a structurally valid document.
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
  });

  test("every annotation kind burns without throwing", async () => {
    const bytes = await samplePdf();
    const sig = normalizeSignature([[[0, 0, 0.5], [50, 20, 0.5], [100, 0, 0.5]]]);
    const annots: Annotation[] = [
      pen(),
      pen({ id: "hl", kind: "highlighter", color: "#fde047", opacity: 0.4, width: 18 }),
      { id: "ln", page: 0, kind: "line", color: "#dc2626", opacity: 1, x1: 10, y1: 10, x2: 200, y2: 300, width: 2, fill: null },
      { id: "ar", page: 1, kind: "arrow", color: "#1d4ed8", opacity: 1, x1: 20, y1: 20, x2: 120, y2: 90, width: 3, fill: null },
      { id: "rc", page: 1, kind: "rect", color: "#16a34a", opacity: 1, x1: 30, y1: 30, x2: 200, y2: 120, width: 2, fill: "#dcfce7" },
      { id: "el", page: 1, kind: "ellipse", color: "#7c3aed", opacity: 0.8, x1: 100, y1: 400, x2: 300, y2: 520, width: 1.5, fill: null },
      { id: "tx", page: 0, kind: "text", color: "#111827", opacity: 1, x: 40, y: 600, text: "Hello\nWorld", size: 14 },
      { id: "sg", page: 1, kind: "signature", color: "#111827", opacity: 1, x: 60, y: 700, w: 180, h: 180 * sig.aspect, paths: sig.paths },
    ];
    const out = await burnAnnotations(bytes, annots);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
    expect(out.byteLength).toBeGreaterThan(bytes.byteLength);
  });

  test("rotated pages burn without throwing", async () => {
    for (const rotation of [90, 180, 270]) {
      const bytes = await samplePdf(rotation, 1);
      const out = await burnAnnotations(bytes, [pen()]);
      expect(out.byteLength).toBeGreaterThan(bytes.byteLength);
    }
  });

  test("annotations pointing past the last page are ignored", async () => {
    const bytes = await samplePdf(0, 1);
    const out = await burnAnnotations(bytes, [pen({ page: 7 })]);
    expect(out).toBe(bytes);
  });

  test("unencodable text doesn't blow up the burn", async () => {
    const bytes = await samplePdf(0, 1);
    const out = await burnAnnotations(bytes, [{
      id: "t", page: 0, kind: "text", color: "#000000", opacity: 1,
      x: 20, y: 20, text: "sign here 👋", size: 12,
    }]);
    expect(out.byteLength).toBeGreaterThan(bytes.byteLength);
  });
});

/** Decoded content stream of page `idx`. */
async function pageContent(bytes: Uint8Array, idx = 0): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPages()[idx]!;
  const contents = page.node.Contents();
  const parts = contents instanceof PDFArray
    ? contents.asArray().map((r) => pdf.context.lookup(r))
    : [contents];
  let out = "";
  for (const part of parts) {
    if (part instanceof PDFRawStream) {
      out += new TextDecoder("latin1").decode(decodePDFRawStream(part).decode());
    }
  }
  return out;
}

describe("burn output shape", () => {
  test("opaque ink embeds no per-stroke graphics state", async () => {
    // pdf-lib embeds a *new* ExtGState object per drawSvgPath call that asks
    // for one, so a many-stroke signature used to add a pile of no-op objects.
    const bytes = await samplePdf(0, 1);
    const sig = normalizeSignature([
      [[0, 0, 0.5], [40, 20, 0.5]],
      [[10, 30, 0.5], [60, 10, 0.5]],
      [[20, 5, 0.5], [80, 40, 0.5]],
    ]);
    const out = await burnAnnotations(bytes, [{
      id: "sg", page: 0, kind: "signature", color: "#111827", opacity: 1,
      x: 40, y: 400, w: 200, h: 200 * sig.aspect, paths: sig.paths,
    }]);
    expect(await pageContent(out)).not.toContain(" gs");
  });

  test("translucent ink still gets its graphics state", async () => {
    const bytes = await samplePdf(0, 1);
    const out = await burnAnnotations(bytes, [pen({ opacity: 0.4 })]);
    expect(await pageContent(out)).toContain(" gs");
  });

  test("the burn survives a reload of its own output", async () => {
    const bytes = await samplePdf(0, 1);
    const once = await burnAnnotations(bytes, [pen()]);
    const twice = await burnAnnotations(once, [pen({ id: "a2" })]);
    expect((await PDFDocument.load(twice)).getPageCount()).toBe(1);
  });
});
