/**
 * Left-rail menu listing every operation panel. Active panel is highlighted.
 */
import type { ReactNode } from "react";
import {
  Combine, Scissors, RotateCw, Stamp, Image, Hash,
  ScanText, FilePen, Info, Lock, Crop, Layers, Pencil, FormInput,
} from "lucide-react";

export type PanelId =
  | "pages"
  | "draw"
  | "merge"
  | "split"
  | "watermark"
  | "stamp"
  | "numbers"
  | "images-to-pdf"
  | "extract-text"
  | "forms"
  | "fields"
  | "metadata"
  | "security"
  | "crop";

type Item = {
  id: PanelId;
  label: string;
  desc: string;
  icon: ReactNode;
  /** Needs at least one open doc. */
  needsDoc?: boolean;
  /** Needs ≥ 2 open docs. */
  needsMultiDoc?: boolean;
};

const ITEMS: Item[] = [
  { id: "pages",         label: "Pages",            desc: "Rotate, delete, duplicate, extract, resize, insert blank.", icon: <Layers size={16} aria-hidden />, needsDoc: true },
  { id: "draw",          label: "Draw",             desc: "Pen, highlighter, shapes, text and signatures — burned in as vector ink.", icon: <Pencil size={16} aria-hidden />, needsDoc: true },
  { id: "merge",         label: "Merge",            desc: "Combine all open PDFs into one.",                            icon: <Combine size={16} aria-hidden />, needsMultiDoc: true },
  { id: "split",         label: "Split",            desc: "Split by ranges / every N / one per page.",                 icon: <Scissors size={16} aria-hidden />, needsDoc: true },
  { id: "crop",          label: "Crop",             desc: "Set MediaBox + CropBox.",                                   icon: <Crop size={16} aria-hidden />, needsDoc: true },
  { id: "watermark",     label: "Text watermark",   desc: "Stamp text across selected pages.",                         icon: <RotateCw size={16} aria-hidden />, needsDoc: true },
  { id: "stamp",         label: "Image stamp",      desc: "Place a PNG/JPG on selected pages.",                        icon: <Stamp size={16} aria-hidden />, needsDoc: true },
  { id: "numbers",       label: "Page numbers",     desc: "Add page numbers with custom format.",                      icon: <Hash size={16} aria-hidden />, needsDoc: true },
  { id: "images-to-pdf", label: "Images → PDF",     desc: "Build a new PDF from images.",                              icon: <Image size={16} aria-hidden /> },
  { id: "extract-text",  label: "Extract text",     desc: "Pull plain text out of the active PDF.",                    icon: <ScanText size={16} aria-hidden />, needsDoc: true },
  { id: "fields",        label: "Form fields",      desc: "Draw form fields by hand, or detect them from underlines and underscore runs.", icon: <FormInput size={16} aria-hidden />, needsDoc: true },
  { id: "forms",         label: "Fill forms",       desc: "List AcroForm fields, set values, optionally flatten.",    icon: <FilePen size={16} aria-hidden />, needsDoc: true },
  { id: "metadata",      label: "Metadata",         desc: "Title, author, dates, keywords.",                           icon: <Info size={16} aria-hidden />, needsDoc: true },
  { id: "security",      label: "Security",         desc: "Remove password / inspect encryption.",                     icon: <Lock size={16} aria-hidden />, needsDoc: true },
];

type Props = {
  active: PanelId | null;
  onPick: (id: PanelId) => void;
  hasDoc: boolean;
  hasMultiDoc: boolean;
};

export function OperationRail({ active, onPick, hasDoc, hasMultiDoc }: Props) {
  return (
    <nav aria-label="PDF operations" className="flex flex-col gap-1">
      <span className="px-2 pb-1 pt-2 text-xs uppercase tracking-wider text-muted">
        Operations
      </span>
      {ITEMS.map((it) => {
        const disabled =
          (it.needsDoc && !hasDoc) || (it.needsMultiDoc && !hasMultiDoc);
        return (
          <button
            key={it.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(it.id)}
            title={it.desc}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
              active === it.id
                ? "bg-accent/15 text-accent"
                : "text-fg hover:bg-card"
            } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
          >
            <span className="opacity-80">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
