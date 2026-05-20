/**
 * Heuristic detection of indent style and line endings from document text.
 */
import type { TabWidth } from "./settings";

/** Detected indent style from document content. */
export type DetectedIndent = {
  style: "spaces" | "tabs";
  width: TabWidth;
};

/** Detect indent from the first 200 indented lines. */
export function detectIndent(text: string): DetectedIndent {
  const lines = text.split(/\r?\n/).slice(0, 500);
  let tabs = 0;
  const spaceCounts: Record<number, number> = {};

  for (const line of lines) {
    if (line.startsWith("\t")) {
      tabs++;
    } else {
      const m = line.match(/^( +)/);
      if (m) {
        const n = m[1].length;
        spaceCounts[n] = (spaceCounts[n] ?? 0) + 1;
      }
    }
  }

  const totalSpaceLines = Object.values(spaceCounts).reduce((a, b) => a + b, 0);
  if (tabs > totalSpaceLines) {
    return { style: "tabs", width: 4 };
  }

  // Find the most common small indent width (1-8)
  const candidates: [number, number][] = [];
  for (let w = 1; w <= 8; w++) {
    const count = spaceCounts[w] ?? 0;
    if (count > 0) candidates.push([w, count]);
  }
  candidates.sort((a, b) => b[1] - a[1]);
  const width = (candidates[0]?.[0] ?? 2) as TabWidth;
  return { style: "spaces", width };
}

/** Detect line ending style. */
export function detectEol(text: string): "lf" | "crlf" {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? "crlf" : "lf";
}

/** Apply EOL conversion to a string. */
export function convertEol(text: string, target: "lf" | "crlf"): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return target === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

/** Trim trailing whitespace from every line. */
export function trimTrailing(text: string): string {
  return text.replace(/[ \t]+$/gm, "");
}

/** Ensure the text ends with a single newline. */
export function ensureFinalNewline(text: string): string {
  return text.endsWith("\n") ? text : text + "\n";
}
