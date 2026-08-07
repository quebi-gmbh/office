/**
 * Form-field authoring — the data model behind the PDF tool's "Form fields"
 * mode, plus the "write them into the AcroForm" step.
 *
 * `app/pdf/lib/forms.ts` reads and fills an *existing* AcroForm. This module is
 * the other half: it turns a flat PDF (a scan, a printed contract, a council
 * form) into one that has fields at all.
 *
 * ## Coordinate space
 *
 * Field rectangles are stored in **view space**, exactly like annotations: page
 * points, origin top-left, y growing downwards, rotation already applied. See
 * the docstring of `annotate.ts` for why.
 *
 * Writing a widget needs PDF user space. pdf-lib's `addToPage()` takes
 * `{x, y, width, height, rotate}` where `width`/`height` are measured in the
 * *widget's own* (rotated) frame and `(x, y)` is the corner `rotateRectangle()`
 * expands from. Working through all four rotations (see `fieldPlacement` and
 * its tests) that corner is always the same view-space point: the **bottom-left
 * corner of the rect**, mapped through {@link viewToPdf}. So the whole
 * transform is one call plus `rotate: degrees(page rotation)`.
 *
 * ## Pending layer
 *
 * Drafts live on `OpenDoc.fields` until the user hits Apply — the same
 * "pending layer, applied once" model Draw mode uses. Auto-detection
 * (`detect-fields.ts`) writes into that same layer rather than into the
 * document, so every proposal is reviewable before it is committed.
 */
import { getPdfLib, loadPdfDoc, savePdfDoc } from "~/pdf/io/pdflib";
import {
  normalizeRotation, sanitizeWinAnsi, viewToPdf, type PageBox,
} from "~/pdf/lib/annotate";
import { pruneDeadFieldRefs } from "~/pdf/lib/forms";

// ── Model ────────────────────────────────────────────────────────────────────

/** Field types we can author. Mirrors pdf-lib's `form.create*()` family. */
export type DraftFieldKind =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "options";

/**
 * Where a draft came from. Detected drafts start life as `status: "proposed"`
 * and render dashed until the user touches them.
 */
export type FieldSource = "manual" | "rule" | "underscore";

export type FieldDraft = {
  id: string;
  /** 0-based page index. */
  page: number;
  kind: DraftFieldKind;
  /** Fully-qualified field name. Radio widgets sharing a name form one group. */
  name: string;
  /** View-space rect: top-left corner + size, in PDF points. */
  x: number;
  y: number;
  w: number;
  h: number;
  source: FieldSource;
  /** `"proposed"` = detected, not yet reviewed. `"placed"` = confirmed. */
  status: "proposed" | "placed";
  /** Initial value (text/dropdown/options), or "true" for a ticked checkbox. */
  value?: string;
  /** Choices for dropdown / option list. */
  options?: string[];
  /** Export value of this widget within its radio group. */
  option?: string;
  multiline?: boolean;
  required?: boolean;
  readOnly?: boolean;
  /** Label the name was inferred from, for the review list. */
  label?: string | null;
};

/** Border / background applied to every widget we write. */
export type FieldStyle = {
  /** Outline width in points; 0 for none. */
  borderWidth: number;
  /** Hex `#rrggbb`, or null for no outline. */
  borderColor: string | null;
  /** Hex `#rrggbb`, or null for a transparent field (keeps the scan visible). */
  backgroundColor: string | null;
};

export const DEFAULT_FIELD_STYLE: FieldStyle = {
  borderWidth: 1,
  borderColor: "#9ca3af",
  backgroundColor: null,
};

export function fieldId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Smallest rect we're willing to write — anything less is a stray click. */
export const MIN_FIELD_SIZE = 4;

export function isUsableField(f: FieldDraft): boolean {
  return f.w >= MIN_FIELD_SIZE && f.h >= MIN_FIELD_SIZE && f.name.trim() !== "";
}

// ── Names ────────────────────────────────────────────────────────────────────

/**
 * Turn a label into a field name: lowercase, ASCII-ish, underscore-separated.
 * Dots are stripped because pdf-lib reads them as AcroForm hierarchy separators
 * and we don't want a stray "Mr. Smith" label to build a tree.
 */
export function slugifyFieldName(label: string): string {
  const base = label
    // Letters NFKD won't decompose, but that readers still expect to survive.
    .replace(/[ßẞ]/g, "ss")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[åÅ]/g, "aa")
    .replace(/[đĐ]/g, "d")
    .replace(/[łŁ]/g, "l")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48)
    .replace(/_+$/g, "");
  return base || "field";
}

/** `base`, or `base_2` / `base_3` / … if it's already taken. Mutates `taken`. */
export function uniqueFieldName(base: string, taken: Set<string>): string {
  const stem = base || "field";
  if (!taken.has(stem)) {
    taken.add(stem);
    return stem;
  }
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${stem}_${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  const fallback = `${stem}_${Math.random().toString(36).slice(2, 6)}`;
  taken.add(fallback);
  return fallback;
}

/**
 * Resolve name collisions across a batch of drafts. Radio drafts intentionally
 * *share* a name (that's what makes them one group), so they're keyed by
 * `name` and keep it; everything else gets deduped.
 */
export function resolveFieldNames(
  fields: FieldDraft[],
  existing: Iterable<string> = [],
): FieldDraft[] {
  const taken = new Set<string>(existing);
  const radioNames = new Map<string, string>();
  return fields.map((f) => {
    const base = slugifyFieldName(f.name);
    if (f.kind === "radio") {
      const already = radioNames.get(base);
      if (already) return { ...f, name: already };
      const name = uniqueFieldName(base, taken);
      radioNames.set(base, name);
      return { ...f, name };
    }
    return { ...f, name: uniqueFieldName(base, taken) };
  });
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export type FieldRect = { x: number; y: number; w: number; h: number };

/** Normalise a dragged rect (either corner first) into top-left + size. */
export function normalizeRect(
  x1: number, y1: number, x2: number, y2: number,
): FieldRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** Clamp a rect so it stays inside the (rotation-applied) page. */
export function clampRect(rect: FieldRect, viewW: number, viewH: number): FieldRect {
  const w = Math.min(rect.w, viewW);
  const h = Math.min(rect.h, viewH);
  return {
    x: Math.min(Math.max(0, rect.x), Math.max(0, viewW - w)),
    y: Math.min(Math.max(0, rect.y), Math.max(0, viewH - h)),
    w,
    h,
  };
}

export type FieldPlacement = {
  /** pdf-lib `addToPage` anchor, PDF user space. */
  x: number;
  y: number;
  /** Widget-frame size (i.e. along the *view* axes). */
  width: number;
  height: number;
  /** Page rotation in degrees, handed straight to `addToPage({ rotate })`. */
  rotate: number;
};

/**
 * View-space rect → the arguments pdf-lib's `addToPage()` wants.
 *
 * `rotateRectangle()` (pdf-lib) expands `(x, y, width, height)` differently per
 * rotation; for all four the anchor works out to the view-space bottom-left
 * corner of the rect. `form-fields.test.ts` pins that down by recomputing the
 * resulting `/Rect` for every rotation.
 */
export function fieldPlacement(box: PageBox, rect: FieldRect): FieldPlacement {
  const anchor = viewToPdf(box, rect.x, rect.y + rect.h);
  return {
    x: anchor.x,
    y: anchor.y,
    width: rect.w,
    height: rect.h,
    rotate: normalizeRotation(box.rotation),
  };
}

// ── Write ────────────────────────────────────────────────────────────────────

function pageBoxOf(page: import("pdf-lib").PDFPage): PageBox {
  const crop = page.getCropBox();
  return {
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
    rotation: normalizeRotation(page.getRotation().angle),
  };
}

function hexToPdfColor(
  hex: string,
  rgb: typeof import("pdf-lib").rgb,
) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  const n = m ? parseInt(m[1]!, 16) : 0;
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

/** Truthy strings a checkbox draft may carry. */
function isChecked(value: string | undefined): boolean {
  return value === "true" || value === "on" || value === "1" || value === "yes";
}

export type AddFieldsResult = {
  bytes: Uint8Array;
  /** Names actually written, in tab order. */
  names: string[];
  /** Drafts that were skipped, with the reason. */
  skipped: { id: string; reason: string }[];
};

/**
 * Create AcroForm fields for `fields` and return the new bytes.
 *
 * Pure `bytes → bytes` like every other operation in `app/pdf/lib`. Widgets are
 * appended to each page's `/Annots` in list order, which is what determines tab
 * order in every reader that doesn't override it — so the caller controls the
 * tab order by ordering the array.
 *
 * ## Why we don't let `save()` regenerate appearances
 *
 * `PDFDocument.save()` calls `form.updateFieldAppearances()` once the form
 * cache is warm, and that throws on documents whose `/Fields` references a dead
 * object ("Expected instance of PDFDict, but got instance of undefined").
 * pdf-lib generates the appearance stream for each *new* widget inside
 * `addToPage()`, so we already have what we need and can save with
 * `updateFieldAppearances: false` — a damaged pre-existing form can no longer
 * take the whole operation down with it.
 */
export async function addFormFields(
  bytes: Uint8Array,
  fields: FieldDraft[],
  style: FieldStyle = DEFAULT_FIELD_STYLE,
): Promise<AddFieldsResult> {
  const usable = fields.filter(isUsableField);
  if (usable.length === 0) return { bytes, names: [], skipped: [] };

  const lib = await getPdfLib();
  const { degrees, rgb } = lib;
  const pdf = await loadPdfDoc(bytes);
  if (pdf.isEncrypted) {
    throw new Error("Can't add form fields to an encrypted PDF — remove the password first");
  }
  // A dangling `/Fields` entry would make every pdf-lib form call throw; drop
  // it before we touch anything. See `pruneDeadFieldRefs`.
  pruneDeadFieldRefs(pdf, lib);
  const pages = pdf.getPages();
  const form = pdf.getForm();

  const borderColor = style.borderColor ? hexToPdfColor(style.borderColor, rgb) : undefined;
  const backgroundColor = style.backgroundColor
    ? hexToPdfColor(style.backgroundColor, rgb)
    : undefined;
  const borderWidth = Math.max(0, style.borderWidth);

  // Last line of defence against name collisions: two fields with the same name
  // are *one* field in AcroForm terms, which silently merges values. The UI
  // dedupes as you go; this catches whatever slipped through (including clashes
  // with the document's existing fields).
  const existing = new Set<string>();
  try {
    for (const f of form.getFields()) existing.add(f.getName());
  } catch {
    // Damaged AcroForm — we can still add fields, we just can't enumerate.
  }
  const drafts = resolveFieldNames(usable, existing);

  const skipped: { id: string; reason: string }[] = [];
  const names: string[] = [];
  /** Radio groups are created once and then collect widgets. */
  const radioGroups = new Map<string, ReturnType<typeof form.createRadioGroup>>();

  for (const draft of drafts) {
    const page = pages[draft.page];
    if (!page) {
      skipped.push({ id: draft.id, reason: "page no longer exists" });
      continue;
    }
    const box = pageBoxOf(page);
    const place = fieldPlacement(box, draft);
    const common = {
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      rotate: degrees(place.rotate),
      borderWidth,
      ...(borderColor ? { borderColor } : {}),
      ...(backgroundColor ? { backgroundColor } : {}),
    };

    try {
      switch (draft.kind) {
        case "text": {
          const field = form.createTextField(draft.name);
          if (draft.multiline) field.enableMultiline();
          if (draft.required) field.enableRequired();
          if (draft.readOnly) field.enableReadOnly();
          // Set the value *before* `addToPage` — that's what generates the
          // widget's appearance stream, and we save without regenerating.
          if (draft.value) field.setText(sanitizeWinAnsi(draft.value));
          field.addToPage(page, common);
          names.push(draft.name);
          break;
        }
        case "checkbox": {
          const field = form.createCheckBox(draft.name);
          if (draft.required) field.enableRequired();
          if (draft.readOnly) field.enableReadOnly();
          field.addToPage(page, common);
          // `check()` flips `/AS` on the widgets that already exist, so it has
          // to come after `addToPage`.
          if (isChecked(draft.value)) field.check();
          names.push(draft.name);
          break;
        }
        case "radio": {
          let group = radioGroups.get(draft.name);
          if (!group) {
            group = form.createRadioGroup(draft.name);
            if (draft.required) group.enableRequired();
            if (draft.readOnly) group.enableReadOnly();
            radioGroups.set(draft.name, group);
            names.push(draft.name);
          }
          const option = sanitizeWinAnsi(draft.option?.trim() || `option_${group.getOptions().length + 1}`);
          group.addOptionToPage(option, page, common);
          if (isChecked(draft.value) || draft.value === option) group.select(option);
          break;
        }
        case "dropdown": {
          const field = form.createDropdown(draft.name);
          const options = (draft.options ?? []).map((o) => sanitizeWinAnsi(o)).filter(Boolean);
          if (options.length) field.addOptions(options);
          if (draft.required) field.enableRequired();
          if (draft.readOnly) field.enableReadOnly();
          const value = draft.value ? sanitizeWinAnsi(draft.value) : "";
          if (value && options.includes(value)) field.select(value);
          field.addToPage(page, common);
          names.push(draft.name);
          break;
        }
        case "options": {
          const field = form.createOptionList(draft.name);
          const options = (draft.options ?? []).map((o) => sanitizeWinAnsi(o)).filter(Boolean);
          if (options.length) field.addOptions(options);
          if (draft.required) field.enableRequired();
          if (draft.readOnly) field.enableReadOnly();
          const chosen = (draft.value ?? "")
            .split(",")
            .map((s) => sanitizeWinAnsi(s.trim()))
            .filter((s) => options.includes(s));
          if (chosen.length) field.select(chosen);
          field.addToPage(page, common);
          names.push(draft.name);
          break;
        }
      }
    } catch (e) {
      skipped.push({ id: draft.id, reason: (e as Error).message });
    }
  }

  // See the docstring: never let a damaged pre-existing form abort the save.
  const out = await savePdfDoc(pdf, { updateFieldAppearances: false });
  return { bytes: out, names, skipped };
}
