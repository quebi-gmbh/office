/**
 * Raster image placement — read a File / data-URL into an {@link ImageNode}
 * sized to its natural dimensions (scaled to fit a max box) and centred at a
 * document point.
 */
import { newId } from "~/vector/lib/id";
import type { ImageNode, Point } from "~/vector/lib/types";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Could not read image"));
    fr.readAsDataURL(file);
  });
}

function naturalSize(href: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 200, h: img.naturalHeight || 200 });
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = href;
  });
}

export interface ImagePlacement {
  /** Centre point (document space). */
  at?: Point;
  /** Cap the placed size so huge photos don't fill the artboard. */
  maxSize?: number;
}

export async function imageNodeFromDataUrl(href: string, place: ImagePlacement = {}): Promise<ImageNode> {
  const { w: nw, h: nh } = await naturalSize(href);
  const max = place.maxSize ?? 480;
  const scale = Math.min(1, max / Math.max(nw, nh));
  const w = nw * scale;
  const h = nh * scale;
  const [cx, cy] = place.at ?? [w / 2, h / 2];
  return {
    id: newId(),
    type: "image",
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
    href,
    rotation: 0,
    fill: null,
    stroke: null,
    strokeWidth: 0,
    opacity: 1,
  };
}

export async function imageNodeFromFile(file: File, place: ImagePlacement = {}): Promise<ImageNode> {
  const href = await readAsDataUrl(file);
  return imageNodeFromDataUrl(href, place);
}
