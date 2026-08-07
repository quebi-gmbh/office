/**
 * Detection against *real* pdf.js output.
 *
 * `detect-fields.test.ts` exercises the heuristics on hand-written geometry;
 * this file checks the layer underneath — that a page pdf-lib drew is read back
 * by pdf.js into the boxes we think it is, coordinate flip and all. It drives
 * the pure readers (`textSpansFromItems`, `rulesFromOperatorList`) directly with
 * pdfjs-dist's legacy build so no browser (or Vite worker import) is involved.
 */
import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  detectFields, rulesFromOperatorList, textSpansFromItems,
  type OpCodes, type PageSignals, type TextItemLike,
} from "./detect-fields";

// The legacy build runs in plain Node/Bun (no DOM, no worker).
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as typeof import("pdfjs-dist");

const OPS = pdfjs.OPS;
const CODES: OpCodes = {
  save: OPS.save,
  restore: OPS.restore,
  transform: OPS.transform,
  setLineWidth: OPS.setLineWidth,
  constructPath: OPS.constructPath,
  paintFormXObjectBegin: OPS.paintFormXObjectBegin,
  paintFormXObjectEnd: OPS.paintFormXObjectEnd,
  beginAnnotation: OPS.beginAnnotation,
  endAnnotation: OPS.endAnnotation,
  strokeOps: [
    OPS.stroke, OPS.closeStroke, OPS.fillStroke,
    OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke,
  ],
};

/** A one-page form: a labelled rule, and a labelled underscore run. */
async function sampleForm(rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  if (rotation) page.setRotation(degrees(rotation));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Name:", { x: 60, y: 700, size: 11, font });
  page.drawLine({
    start: { x: 120, y: 698 },
    end: { x: 420, y: 698 },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  page.drawText("Phone: ____________________", { x: 60, y: 660, size: 11, font });
  return doc.save();
}

async function signalsOf(bytes: Uint8Array): Promise<PageSignals> {
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const page: PDFPageProxy = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const content = await page.getTextContent();
  const signals: PageSignals = {
    page: 0,
    width: viewport.width,
    height: viewport.height,
    texts: textSpansFromItems(
      content.items as TextItemLike[],
      viewport.transform as unknown as number[],
    ),
    rules: rulesFromOperatorList(
      ops.fnArray,
      ops.argsArray as unknown as ArrayLike<unknown>,
      CODES,
      viewport.transform as unknown as number[],
    ),
  };
  await pdf.loadingTask.destroy();
  return signals;
}

describe("reading a real page", () => {
  test("a drawn line comes back as a thin view-space rule", async () => {
    const signals = await signalsOf(await sampleForm());
    expect(signals.width).toBe(595);
    expect(signals.height).toBe(842);

    const rule = signals.rules.find((r) => r.w > 100);
    expect(rule).toBeDefined();
    // PDF y=698 on an 842pt page is view y=144; the stroke straddles the line.
    expect(rule!.x).toBeCloseTo(120 - 0.375, 1);
    expect(rule!.w).toBeCloseTo(300 + 0.75, 1);
    expect(rule!.y + rule!.h / 2).toBeCloseTo(842 - 698, 1);
    expect(rule!.h).toBeLessThan(2);
  });

  test("text runs come back as view-space boxes above their baseline", async () => {
    const signals = await signalsOf(await sampleForm());
    const name = signals.texts.find((t) => t.str.startsWith("Name"));
    expect(name).toBeDefined();
    expect(name!.x).toBeCloseTo(60, 1);
    expect(name!.y + name!.h).toBeCloseTo(842 - 700, 1);
    expect(name!.w).toBeGreaterThan(20);
  });

  test("end to end: both detectors fire and are named from their labels", async () => {
    const signals = await signalsOf(await sampleForm());
    const { fields } = detectFields([signals]);
    expect(fields.map((f) => f.name)).toEqual(["name", "phone"]);
    expect(fields.map((f) => f.source)).toEqual(["rule", "underscore"]);

    const [nameField, phoneField] = fields;
    // Rests on the line it was detected from.
    expect(nameField!.y + nameField!.h).toBeCloseTo(842 - 698, 0);
    // Starts at the line's left edge, give or take the inset and stroke width.
    expect(Math.abs(nameField!.x - 120)).toBeLessThan(2);
    // Starts after "Phone: ", not at the start of the run.
    expect(phoneField!.x).toBeGreaterThan(90);
  });

  test("a rotated page is read in the rotated view space", async () => {
    const signals = await signalsOf(await sampleForm(90));
    expect(signals.width).toBe(842);
    expect(signals.height).toBe(595);
    const { fields } = detectFields([signals]);
    // The rule now runs vertically on screen, so it isn't a fill-in line any
    // more — but the underscore run's text is rotated too and drops out with
    // it. What matters is that nothing lands off-page.
    for (const f of fields) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(signals.width + 1);
      expect(f.y + f.h).toBeLessThanOrEqual(signals.height + 1);
    }
  });
});
