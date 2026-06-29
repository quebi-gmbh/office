/**
 * AcroForm support: list fields, fill values by name, optionally flatten.
 * pdf-lib's form API covers text fields, checkboxes, radio groups, dropdowns,
 * option lists, and buttons — we expose each via a normalised descriptor.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";

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
  if (flatten) form.flatten();
  return savePdfDoc(pdf);
}
