/**
 * Document (de)serialisation:
 *   - {@link sceneToSvg}   — a full, standalone SVG document string (export).
 *   - {@link sceneToJson}/{@link sceneFromJson} — the native persistence format.
 */
import { nodeToSvgString, sceneDefsSvg } from "./render";
import { boundsToRect, unionBounds } from "./geometry";
import type { VNode, VectorScene } from "./types";

export const SCENE_VERSION = 1;

export interface SvgOptions {
  /** Crop the viewBox to the union bounds of these nodes (export selection). */
  crop?: VNode[];
  /** Extra margin around a cropped viewBox, in user units. */
  margin?: number;
}

/** Serialise a scene to a complete, standalone SVG document. */
export function sceneToSvg(scene: VectorScene, opts: SvgOptions = {}): string {
  const { doc, nodes } = scene;
  let vbX = 0;
  let vbY = 0;
  let vbW = doc.width;
  let vbH = doc.height;
  if (opts.crop && opts.crop.length > 0) {
    const b = unionBounds(opts.crop);
    if (b) {
      const m = opts.margin ?? 0;
      const r = boundsToRect(b);
      vbX = r.x - m;
      vbY = r.y - m;
      vbW = Math.max(1, r.w + m * 2);
      vbH = Math.max(1, r.h + m * 2);
    }
  }
  const bg =
    doc.background && doc.background !== "transparent"
      ? `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="${doc.background}" />`
      : "";
  const defs = sceneDefsSvg(nodes);
  const body = nodes.map(nodeToSvgString).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vbW}" height="${vbH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`,
    defs ? `  <defs>${defs}</defs>` : null,
    bg ? `  ${bg}` : null,
    body ? `  ${body}` : null,
    `</svg>`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export interface SceneFile {
  version: number;
  scene: VectorScene;
}

export function sceneToJson(scene: VectorScene): string {
  return JSON.stringify({ version: SCENE_VERSION, scene } satisfies SceneFile);
}

export function sceneFromJson(raw: string): VectorScene | null {
  try {
    const parsed = JSON.parse(raw) as SceneFile;
    if (!parsed || typeof parsed !== "object" || !parsed.scene) return null;
    const { doc, nodes } = parsed.scene;
    if (!doc || !Array.isArray(nodes)) return null;
    return parsed.scene;
  } catch {
    return null;
  }
}
