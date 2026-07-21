/**
 * Document (de)serialisation:
 *   - {@link sceneToSvg}   — a full, standalone SVG document string (export).
 *   - {@link sceneToJson}/{@link sceneFromJson} — the native persistence format.
 */
import { nodeToSvgString } from "./render";
import type { VectorScene } from "./types";

export const SCENE_VERSION = 1;

/** Serialise a scene to a complete, standalone SVG document. */
export function sceneToSvg(scene: VectorScene): string {
  const { doc, nodes } = scene;
  const bg =
    doc.background && doc.background !== "transparent"
      ? `<rect x="0" y="0" width="${doc.width}" height="${doc.height}" fill="${doc.background}" />`
      : "";
  const body = nodes.map(nodeToSvgString).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">`,
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
