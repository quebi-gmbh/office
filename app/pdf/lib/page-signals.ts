/**
 * Page signals — the pdf.js side of field auto-detection.
 *
 * Reads the two things `detect-fields.ts` needs off a real page and converts
 * them into plain view-space geometry (origin top-left, y down, PDF points,
 * page rotation applied — the same space annotations and field drafts live in):
 *
 * - **Text runs** from `page.getTextContent()`. Each item carries a transform,
 *   a width and a height; combined with the viewport transform that's a box.
 * - **Vector paths** from `page.getOperatorList()`. Every `OPS.constructPath`
 *   entry carries a bounding box in path space, so replaying the graphics-state
 *   stack gives us each path's box in view space. Thin wide ones are the rules
 *   classic printed forms are made of.
 *
 * This module is deliberately thin: it fetches, hands the raw arrays to the
 * pure replay in `detect-fields.ts`, and labels the result.
 */
import type { PDFPageProxy } from "pdfjs-dist";
import { getPdfjs } from "~/pdf/io/pdfjs";
import { getSharedPdfJsDoc } from "~/pdf/lib/thumb-cache";
import {
  rulesFromOperatorList, textSpansFromItems,
  type OpCodes, type PageSignals, type RuleSpan, type TextItemLike,
  type TextSpan,
} from "~/pdf/lib/detect-fields";

/** Guard against pathological pages (maps, CAD drawings) melting the tab. */
const LIMITS = { maxOps: 160_000, maxRules: 4_000 };

/** Read the text runs of one page as view-space boxes. */
export async function readTextSpans(page: PDFPageProxy): Promise<TextSpan[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return textSpansFromItems(
    content.items as TextItemLike[],
    viewport.transform as unknown as number[],
  );
}

/** pdf.js' `OPS` narrowed to what the replay needs. */
export async function opCodes(): Promise<OpCodes> {
  const { OPS } = await getPdfjs();
  return {
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
}

/** Bounding boxes of one page's vector paths, in view space. */
export async function readRuleSpans(page: PDFPageProxy): Promise<RuleSpan[]> {
  const [codes, ops] = await Promise.all([opCodes(), page.getOperatorList()]);
  const viewport = page.getViewport({ scale: 1 });
  return rulesFromOperatorList(
    ops.fnArray,
    ops.argsArray as unknown as ArrayLike<unknown>,
    codes,
    viewport.transform as unknown as number[],
    LIMITS,
  );
}

/** Both signals for one page, in view space. */
export async function readPageSignals(
  page: PDFPageProxy,
  pageIndex: number,
): Promise<PageSignals> {
  const viewport = page.getViewport({ scale: 1 });
  const [texts, rules] = await Promise.all([
    readTextSpans(page).catch(() => [] as TextSpan[]),
    readRuleSpans(page).catch(() => [] as RuleSpan[]),
  ]);
  return {
    page: pageIndex,
    width: viewport.width,
    height: viewport.height,
    texts,
    rules,
  };
}

/**
 * Read signals for the given 0-based page indices of an open document, reusing
 * the pdf.js parse the thumbnail renderer already did.
 */
export async function readDocSignals(
  docId: string,
  rev: number,
  bytes: Uint8Array,
  pages: number[],
  password?: string,
): Promise<PageSignals[]> {
  const pdf = await getSharedPdfJsDoc(docId, rev, bytes, password);
  const out: PageSignals[] = [];
  for (const index of pages) {
    if (index < 0 || index >= pdf.numPages) continue;
    const page = await pdf.getPage(index + 1);
    out.push(await readPageSignals(page, index));
  }
  return out;
}
