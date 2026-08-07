import { describe, expect, test } from "bun:test";
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString,
  degrees,
} from "pdf-lib";
import { viewToPdf, type PageBox } from "./annotate";
import {
  addFormFields, clampRect, fieldPlacement, isUsableField, normalizeRect,
  resolveFieldNames, slugifyFieldName, uniqueFieldName,
  type FieldDraft, type FieldRect, type FieldStyle,
} from "./form-fields";
import { fillFormFields, listFormFields } from "./forms";

const NO_CHROME: FieldStyle = { borderWidth: 0, borderColor: null, backgroundColor: null };

function draft(over: Partial<FieldDraft> = {}): FieldDraft {
  return {
    id: "f1", page: 0, kind: "text", name: "applicant_name",
    x: 100, y: 200, w: 180, h: 16,
    source: "manual", status: "placed",
    ...over,
  };
}

async function blankPdf(
  opts: { width?: number; height?: number; rotation?: number; pages?: number } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < (opts.pages ?? 1); i++) {
    const page = pdf.addPage([opts.width ?? 595, opts.height ?? 842]);
    if (opts.rotation) page.setRotation(degrees(opts.rotation));
  }
  return pdf.save();
}

/** The `/Rect` of the first widget of `name`, as {x, y, width, height}. */
async function widgetRect(bytes: Uint8Array, name: string) {
  const pdf = await PDFDocument.load(bytes);
  const field = pdf.getForm().getField(name);
  return field.acroField.getWidgets()[0]!.getRectangle();
}

// ── Names ────────────────────────────────────────────────────────────────────

describe("field names", () => {
  test("slugify turns a label into a usable name", () => {
    expect(slugifyFieldName("Applicant name")).toBe("applicant_name");
    expect(slugifyFieldName("  Date of birth:  ")).toBe("date_of_birth");
    expect(slugifyFieldName("E-Mail / Telefon")).toBe("e_mail_telefon");
    expect(slugifyFieldName("Straße")).toBe("strasse");
    expect(slugifyFieldName("Mr. Smith")).toBe("mr_smith");
  });

  test("slugify never returns an empty or dotted name", () => {
    expect(slugifyFieldName("")).toBe("field");
    expect(slugifyFieldName("…")).toBe("field");
    expect(slugifyFieldName("a.b.c")).toBe("a_b_c");
  });

  test("uniqueFieldName suffixes collisions", () => {
    const taken = new Set<string>();
    expect(uniqueFieldName("name", taken)).toBe("name");
    expect(uniqueFieldName("name", taken)).toBe("name_2");
    expect(uniqueFieldName("name", taken)).toBe("name_3");
  });

  test("resolveFieldNames dedupes, but keeps a radio group together", () => {
    const out = resolveFieldNames([
      draft({ id: "a", name: "Name" }),
      draft({ id: "b", name: "name" }),
      draft({ id: "c", name: "Gender", kind: "radio", option: "m" }),
      draft({ id: "d", name: "gender", kind: "radio", option: "f" }),
    ], ["name"]);
    expect(out.map((f) => f.name)).toEqual(["name_2", "name_3", "gender", "gender"]);
  });
});

// ── Geometry ─────────────────────────────────────────────────────────────────

describe("rect helpers", () => {
  test("normalizeRect accepts either drag direction", () => {
    expect(normalizeRect(80, 60, 20, 10)).toEqual({ x: 20, y: 10, w: 60, h: 50 });
    expect(normalizeRect(20, 10, 80, 60)).toEqual({ x: 20, y: 10, w: 60, h: 50 });
  });

  test("clampRect keeps a field on the page", () => {
    expect(clampRect({ x: -20, y: -5, w: 40, h: 10 }, 100, 100))
      .toEqual({ x: 0, y: 0, w: 40, h: 10 });
    expect(clampRect({ x: 90, y: 95, w: 40, h: 10 }, 100, 100))
      .toEqual({ x: 60, y: 90, w: 40, h: 10 });
  });

  test("isUsableField rejects slivers and unnamed fields", () => {
    expect(isUsableField(draft())).toBe(true);
    expect(isUsableField(draft({ w: 1 }))).toBe(false);
    expect(isUsableField(draft({ name: "  " }))).toBe(false);
  });
});

describe("fieldPlacement", () => {
  const rect: FieldRect = { x: 100, y: 200, w: 180, h: 16 };

  test("unrotated: the anchor is the rect's lower-left in PDF space", () => {
    const box: PageBox = { x: 0, y: 0, width: 595, height: 842, rotation: 0 };
    expect(fieldPlacement(box, rect)).toEqual({
      x: 100, y: 842 - 216, width: 180, height: 16, rotate: 0,
    });
  });

  test("the resulting widget box covers the view rect for every rotation", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const box: PageBox = { x: 12, y: 7, width: 595, height: 842, rotation };
      const p = fieldPlacement(box, rect);
      // Re-implement pdf-lib's `rotateRectangle` (borderWidth 0).
      const got = rotation === 90
        ? { x1: p.x - p.height, y1: p.y, x2: p.x, y2: p.y + p.width }
        : rotation === 180
        ? { x1: p.x - p.width, y1: p.y - p.height, x2: p.x, y2: p.y }
        : rotation === 270
        ? { x1: p.x, y1: p.y - p.width, x2: p.x + p.height, y2: p.y }
        : { x1: p.x, y1: p.y, x2: p.x + p.width, y2: p.y + p.height };
      // Expected: the bounding box of the view rect's corners in PDF space.
      const corners = [
        viewToPdf(box, rect.x, rect.y),
        viewToPdf(box, rect.x + rect.w, rect.y),
        viewToPdf(box, rect.x, rect.y + rect.h),
        viewToPdf(box, rect.x + rect.w, rect.y + rect.h),
      ];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      expect(got.x1).toBeCloseTo(Math.min(...xs), 6);
      expect(got.y1).toBeCloseTo(Math.min(...ys), 6);
      expect(got.x2).toBeCloseTo(Math.max(...xs), 6);
      expect(got.y2).toBeCloseTo(Math.max(...ys), 6);
    }
  });
});

// ── Writing ──────────────────────────────────────────────────────────────────

describe("addFormFields", () => {
  test("creates an AcroForm in a document that has none", async () => {
    const bytes = await blankPdf();
    expect(await listFormFields(bytes)).toEqual([]);

    const out = await addFormFields(bytes, [draft()], NO_CHROME);
    expect(out.names).toEqual(["applicant_name"]);
    expect(out.skipped).toEqual([]);

    const fields = await listFormFields(out.bytes);
    expect(fields).toEqual([{ name: "applicant_name", kind: "text", value: "" }]);
  });

  test("writes the widget where the view rect said", async () => {
    const bytes = await blankPdf({ width: 595, height: 842 });
    const out = await addFormFields(bytes, [draft()], NO_CHROME);
    const rect = await widgetRect(out.bytes, "applicant_name");
    expect(rect.x).toBeCloseTo(100, 4);
    expect(rect.y).toBeCloseTo(842 - 216, 4);
    expect(rect.width).toBeCloseTo(180, 4);
    expect(rect.height).toBeCloseTo(16, 4);
  });

  test("a rotated page gets a rotated widget in the right place", async () => {
    const bytes = await blankPdf({ width: 595, height: 842, rotation: 90 });
    const out = await addFormFields(bytes, [draft()], NO_CHROME);
    const rect = await widgetRect(out.bytes, "applicant_name");
    // View space is 842×595 here; the widget's box is the rect's transpose.
    expect(rect.x).toBeCloseTo(200, 4);
    expect(rect.y).toBeCloseTo(100, 4);
    expect(rect.width).toBeCloseTo(16, 4);
    expect(rect.height).toBeCloseTo(180, 4);

    // …and the widget carries the page's rotation so the text reads upright.
    const pdf = await PDFDocument.load(out.bytes);
    const widget = pdf.getForm().getField("applicant_name").acroField.getWidgets()[0]!;
    expect(widget.getAppearanceCharacteristics()?.getRotation()).toBe(90);
  });

  test("every field kind round-trips", async () => {
    const bytes = await blankPdf();
    const out = await addFormFields(bytes, [
      draft({ id: "1", kind: "text", name: "full_name", value: "Ada" }),
      draft({ id: "2", kind: "checkbox", name: "agree", y: 240, w: 12, h: 12, value: "true" }),
      draft({ id: "3", kind: "dropdown", name: "country", y: 260, options: ["DE", "GB"], value: "GB" }),
      draft({ id: "4", kind: "options", name: "langs", y: 300, h: 40, options: ["de", "en"], value: "en" }),
      draft({ id: "5", kind: "radio", name: "gender", y: 360, w: 12, h: 12, option: "m" }),
      draft({ id: "6", kind: "radio", name: "gender", x: 130, y: 360, w: 12, h: 12, option: "f" }),
    ], NO_CHROME);
    expect(out.skipped).toEqual([]);

    const fields = await listFormFields(out.bytes);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.full_name).toMatchObject({ kind: "text", value: "Ada" });
    expect(byName.agree).toMatchObject({ kind: "checkbox", value: "true" });
    expect(byName.country).toMatchObject({ kind: "dropdown", value: "GB" });
    expect(byName.langs).toMatchObject({ kind: "options", value: "en" });
    expect(byName.gender).toMatchObject({ kind: "radio" });
    expect(byName.gender!.options).toEqual(["m", "f"]);

    // The two radio widgets are one field with two widgets, not two fields.
    expect(fields.length).toBe(5);
  });

  test("names never collide with the document's existing fields", async () => {
    const first = await addFormFields(await blankPdf(), [draft({ name: "name" })], NO_CHROME);
    const second = await addFormFields(first.bytes, [draft({ id: "x", name: "Name", y: 300 })], NO_CHROME);
    expect(second.names).toEqual(["name_2"]);
    const names = (await listFormFields(second.bytes)).map((f) => f.name).sort();
    expect(names).toEqual(["name", "name_2"]);
  });

  test("skips drafts that point at a page which no longer exists", async () => {
    const bytes = await blankPdf();
    const out = await addFormFields(bytes, [draft({ page: 4 })], NO_CHROME);
    expect(out.names).toEqual([]);
    expect(out.skipped[0]?.reason).toContain("page");
  });

  test("ignores slivers and unnamed drafts without failing the batch", async () => {
    const bytes = await blankPdf();
    const out = await addFormFields(bytes, [
      draft({ id: "1", w: 0.5 }),
      draft({ id: "2", name: "", y: 300 }),
      draft({ id: "3", name: "kept", y: 400 }),
    ], NO_CHROME);
    expect(out.names).toEqual(["kept"]);
  });

  test("tab order follows the order fields were listed", async () => {
    const bytes = await blankPdf();
    const out = await addFormFields(bytes, [
      draft({ id: "1", name: "second", y: 400 }),
      draft({ id: "2", name: "first", y: 100 }),
    ], NO_CHROME);
    const pdf = await PDFDocument.load(out.bytes);
    const annots = pdf.getPages()[0]!.node.Annots()!;
    expect(annots.size()).toBe(2);
    // Read the field names back off the widgets in /Annots order — that array
    // is what every reader tabs through.
    const names = annots.asArray().map((ref) => {
      const widget = pdf.context.lookup(ref, PDFDict);
      const field = widget.lookupMaybe(PDFName.of("Parent"), PDFDict) ?? widget;
      // pdf-lib writes /T as a hex string; both string flavours decode alike.
      return (field.get(PDFName.of("T")) as PDFString | PDFHexString).decodeText();
    });
    expect(names).toEqual(["second", "first"]);
  });

  test("survives a form whose /Fields references a dead object", async () => {
    // The landmine from #129: `save()` normally regenerates appearances for
    // every field, and that throws on a form like this one.
    const seeded = await addFormFields(await blankPdf(), [draft({ name: "victim" })], NO_CHROME);
    const pdf = await PDFDocument.load(seeded.bytes);
    const acroForm = pdf.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    // Point /Fields at an object number nothing was ever written to.
    acroForm.lookup(PDFName.of("Fields"), PDFArray).push(PDFRef.of(9_999));
    const damaged = await pdf.save({ updateFieldAppearances: false });

    // Listing and filling survive it too — a dangling reference carries no
    // information, so we prune it rather than let it poison every form call.
    expect(await listFormFields(damaged)).toEqual([
      { name: "victim", kind: "text", value: "" },
    ]);
    const filled = await fillFormFields(damaged, [{ name: "victim", value: "hi" }], false);
    expect((await listFormFields(filled))[0]!.value).toBe("hi");

    const out = await addFormFields(damaged, [draft({ id: "n", name: "added", y: 500 })], NO_CHROME);
    expect(out.names).toEqual(["added"]);
    expect(out.skipped).toEqual([]);

    // The new widget really landed on the page (enumerating the damaged form
    // still throws, which is exactly why we never let `save()` walk it).
    const reloaded = await PDFDocument.load(out.bytes);
    const annots = reloaded.getPages()[0]!.node.Annots()!;
    const names = annots.asArray().map((ref) => {
      const widget = reloaded.context.lookup(ref, PDFDict);
      const field = widget.lookupMaybe(PDFName.of("Parent"), PDFDict) ?? widget;
      return (field.get(PDFName.of("T")) as PDFString | PDFHexString).decodeText();
    });
    expect(names).toEqual(["victim", "added"]);
  });
});
