/**
 * AcroForm support: list fields, fill values by name, optionally flatten.
 * pdf-lib's form API covers text fields, checkboxes, radio groups, dropdowns,
 * option lists, and buttons — we expose each via a normalised descriptor.
 *
 * Creating fields on a document that has none is the other half of the story;
 * that lives in `form-fields.ts`.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

type PdfLib = Awaited<ReturnType<typeof getPdfLib>>;

/**
 * Drop `/Fields` (and `/Kids`) entries that don't resolve to a dictionary.
 *
 * Real-world forms are damaged this way more often than you'd hope — a
 * `/Fields` array left pointing at an object the producer never wrote. pdf-lib
 * walks that array eagerly (`getFields()`, `updateFieldAppearances()`, and
 * therefore `save()` too) and blows up with "Expected instance of PDFDict, but
 * got instance of undefined", which takes down listing, filling *and* saving.
 *
 * A dangling reference carries no information, so pruning it loses nothing and
 * turns an unusable document into a workable one. Returns how many went.
 */
export function pruneDeadFieldRefs(
  pdf: import("pdf-lib").PDFDocument,
  lib: PdfLib,
): number {
  const acroForm = pdf.catalog.lookupMaybe(lib.PDFName.of("AcroForm"), lib.PDFDict);
  if (!acroForm) return 0;
  let removed = 0;
  const visit = (dict: import("pdf-lib").PDFDict, key: "Fields" | "Kids", depth: number) => {
    const arr = dict.lookupMaybe(lib.PDFName.of(key), lib.PDFArray);
    if (!arr) return;
    for (let i = arr.size() - 1; i >= 0; i--) {
      const child = arr.lookup(i);
      if (!(child instanceof lib.PDFDict)) {
        arr.remove(i);
        removed++;
        continue;
      }
      if (depth < 8) visit(child, "Kids", depth + 1);
    }
  };
  visit(acroForm, "Fields", 0);
  return removed;
}

export type FieldKind = "text" | "checkbox" | "radio" | "dropdown" | "options" | "button" | "signature" | "unknown";

export type FieldInfo = {
  name: string;
  kind: FieldKind;
  /** Current value (string for text/dropdown, "true"/"false" for checkbox, …). */
  value: string;
  /** Choices for dropdown/options/radio. */
  options?: string[];
};

export async function listFormFields(bytes: Uint8Array): Promise<FieldInfo[]> {
  const lib = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  pruneDeadFieldRefs(pdf, lib);
  const form = pdf.getForm();
  const out: FieldInfo[] = [];
  for (const field of form.getFields()) {
    const name = field.getName();
    if (field instanceof lib.PDFTextField) {
      out.push({ name, kind: "text", value: field.getText() ?? "" });
    } else if (field instanceof lib.PDFCheckBox) {
      out.push({ name, kind: "checkbox", value: field.isChecked() ? "true" : "false" });
    } else if (field instanceof lib.PDFRadioGroup) {
      out.push({
        name,
        kind: "radio",
        value: field.getSelected() ?? "",
        options: field.getOptions(),
      });
    } else if (field instanceof lib.PDFDropdown) {
      out.push({
        name,
        kind: "dropdown",
        value: field.getSelected().join(", "),
        options: field.getOptions(),
      });
    } else if (field instanceof lib.PDFOptionList) {
      out.push({
        name,
        kind: "options",
        value: field.getSelected().join(", "),
        options: field.getOptions(),
      });
    } else if (field instanceof lib.PDFButton) {
      out.push({ name, kind: "button", value: "" });
    } else if (field instanceof lib.PDFSignature) {
      out.push({ name, kind: "signature", value: "" });
    } else {
      out.push({ name, kind: "unknown", value: "" });
    }
  }
  return out;
}

export type FieldUpdate = { name: string; value: string };

export async function fillFormFields(
  bytes: Uint8Array,
  updates: FieldUpdate[],
  flatten: boolean,
): Promise<Uint8Array> {
  const lib = await getPdfLib();
  const pdf = await loadPdfDoc(bytes);
  pruneDeadFieldRefs(pdf, lib);
  const form = pdf.getForm();
  for (const { name, value } of updates) {
    const field = form.getFieldMaybe(name);
    if (!field) continue;
    try {
      if (field instanceof lib.PDFTextField) {
        field.setText(value);
      } else if (field instanceof lib.PDFCheckBox) {
        if (value === "true" || value === "on" || value === "1") field.check();
        else field.uncheck();
      } else if (field instanceof lib.PDFRadioGroup) {
        if (value) field.select(value);
      } else if (field instanceof lib.PDFDropdown) {
        const choices = value.split(",").map((s) => s.trim()).filter(Boolean);
        if (choices.length) field.select(choices);
      } else if (field instanceof lib.PDFOptionList) {
        const choices = value.split(",").map((s) => s.trim()).filter(Boolean);
        if (choices.length) field.select(choices);
      }
    } catch {
      /* skip fields that reject the supplied value */
    }
  }
  // pdf-lib would call `form.updateFieldAppearances()` for us (inside both
  // `flatten()` and `save()`), but that call throws outright on a form whose
  // `/Fields` references a dead object ("Expected instance of PDFDict, but got
  // instance of undefined") — and plenty of real-world forms are damaged
  // exactly that way. Run it ourselves so a throw only costs the appearances of
  // the fields we hadn't reached yet, then ask the reader to regenerate the
  // rest, and keep pdf-lib from re-running it later.
  try {
    form.updateFieldAppearances();
  } catch {
    try {
      form.acroForm.dict.set(lib.PDFName.of("NeedAppearances"), lib.PDFBool.True);
    } catch {
      /* nothing else we can do — the values are still written */
    }
  }
  if (flatten) form.flatten({ updateFieldAppearances: false });
  return savePdfDoc(pdf, { updateFieldAppearances: false });
}
