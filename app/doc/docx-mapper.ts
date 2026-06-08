/**
 * DOCX export mapper — converts TipTap JSONContent → docx SDK objects.
 *
 * Pure function: no React, no TipTap editor instance required.
 *
 * Known losses (documented in JSDoc):
 *   - Images: omitted (base64 inline images are too large for a useful docx)
 *   - Syntax-highlighted code: rendered as plain code paragraph
 *   - Footnote bodies: omitted (ref markers converted to [n])
 *   - YouTube embeds: omitted
 *   - Text color/highlight: omitted (docx color API differs)
 *   - Task list checked state: rendered as plain bullet (no checkbox symbol)
 */
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  PageBreak as DocxPageBreak,
  Packer,
  type IRunOptions,
} from "docx";
import type { JSONContent } from "@tiptap/react";

// ── Internal types ────────────────────────────────────────────────────────────

type DocxChild = Paragraph | Table;

// ── Mark → TextRun props ──────────────────────────────────────────────────────

function marksToRunProps(marks: JSONContent["marks"]): Partial<IRunOptions> {
  if (!marks) return {};
  // Build as a plain record first — IRunOptions props are readonly so we cast.
  const p: Record<string, unknown> = {};
  for (const m of marks) {
    if (m.type === "bold")        p["bold"]       = true;
    if (m.type === "italic")      p["italics"]    = true;
    if (m.type === "underline")   p["underline"]  = {};
    if (m.type === "strike")      p["strike"]     = true;
    if (m.type === "superscript") p["superScript"] = true;
    if (m.type === "subscript")   p["subScript"]  = true;
    if (m.type === "code")        p["font"]       = { name: "Courier New" };
  }
  return p as Partial<IRunOptions>;
}

// ── Node → inline runs ────────────────────────────────────────────────────────

function nodeToRuns(node: JSONContent): (TextRun | ExternalHyperlink)[] {
  if (node.type === "text") {
    const runProps = marksToRunProps(node.marks);
    const linkMark = node.marks?.find((m) => m.type === "link");
    const run = new TextRun(Object.assign({ text: node.text ?? "" }, runProps) as IRunOptions);
    if (linkMark?.attrs?.href) {
      return [
        new ExternalHyperlink({
          link: linkMark.attrs.href as string,
          children: [run],
        }),
      ];
    }
    return [run];
  }
  if (node.type === "hardBreak") return [new TextRun({ break: 1 })];
  if (node.type === "footnoteRef") {
    // Render as [n] superscript placeholder
    return [new TextRun({ text: `[${node.attrs?.id ? "*" : "?"}]`, superScript: true })];
  }
  return (node.content ?? []).flatMap(nodeToRuns);
}

function contentRuns(node: JSONContent): (TextRun | ExternalHyperlink)[] {
  return (node.content ?? []).flatMap(nodeToRuns);
}

// ── Alignment ─────────────────────────────────────────────────────────────────

type DocxAlignment = (typeof AlignmentType)[keyof typeof AlignmentType];

function toDocxAlign(align: string | undefined): DocxAlignment | undefined {
  const map: Record<string, DocxAlignment> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };
  return align ? map[align] : undefined;
}

// ── Node converters ───────────────────────────────────────────────────────────

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function convertNode(node: JSONContent): DocxChild[] {
  switch (node.type) {
    case "paragraph":
      return [
        new Paragraph({
          children: contentRuns(node),
          alignment: toDocxAlign(node.attrs?.textAlign as string | undefined),
        }),
      ];

    case "heading":
      return [
        new Paragraph({
          heading: HEADING_MAP[(node.attrs?.level as number) ?? 1] ?? HeadingLevel.HEADING_1,
          children: contentRuns(node),
        }),
      ];

    case "blockquote":
      return (node.content ?? []).flatMap((child) => [
        new Paragraph({
          children: [new TextRun({ text: "" }), ...contentRuns(child)],
          indent: { left: 360 },
          border: {
            left: { style: BorderStyle.THICK, size: 6, color: "999999" },
          },
        }),
      ]);

    case "bulletList":
    case "taskList":
      return (node.content ?? []).map(
        (item) =>
          new Paragraph({
            children: [
              new TextRun({ text: "• " }),
              ...(item.content ?? []).flatMap(contentRuns),
            ],
            indent: { left: 360 },
          }),
      );

    case "orderedList": {
      let n = 1;
      return (node.content ?? []).map(
        (item) =>
          new Paragraph({
            children: [
              new TextRun({ text: `${n++}. ` }),
              ...(item.content ?? []).flatMap(contentRuns),
            ],
            indent: { left: 360 },
          }),
      );
    }

    case "codeBlock": {
      const codeText = (node.content ?? []).map((c) => c.text ?? "").join("\n");
      return [
        new Paragraph({
          children: [
            new TextRun({ text: codeText, font: { name: "Courier New" }, size: 18 }),
          ],
          shading: { fill: "F4F4F5" },
        }),
      ];
    }

    case "table": {
      const rows = (node.content ?? []).map(
        (row) =>
          new DocxTableRow({
            children: (row.content ?? []).map(
              (cell) =>
                new DocxTableCell({
                  children: (cell.content ?? []).flatMap(convertNode).filter(
                    (p): p is Paragraph => p instanceof Paragraph,
                  ),
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" },
                  },
                }),
            ),
          }),
      );
      return [
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ];
    }

    case "horizontalRule":
      return [
        new Paragraph({
          children: [],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "E4E4E7" } },
        }),
      ];

    case "pageBreak":
      return [new Paragraph({ children: [new DocxPageBreak()] })];

    case "image":
      return [
        new Paragraph({
          children: [new TextRun({ text: "[Image omitted]", italics: true, color: "999999" })],
        }),
      ];

    // Skip unsupported nodes
    case "footnoteBody":
    case "youtubeEmbed":
      return [];

    default:
      if (node.content) return node.content.flatMap(convertNode);
      return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert TipTap JSONContent to a .docx Blob.
 *
 * Note on losses:
 *   - Images are replaced with "[Image omitted]" italic text.
 *   - Syntax-highlighted code blocks are rendered as plain Courier New paragraphs.
 *   - Text color and highlight are not transferred.
 *   - YouTube embeds and footnote bodies are omitted silently.
 */
export async function jsonToDocxBlob(
  content: JSONContent,
  title: string,
): Promise<Blob> {
  const children: DocxChild[] = (content.content ?? []).flatMap(convertNode);

  const doc = new Document({
    title,
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc);
}
