/**
 * Scanline flood-fill operating directly on a Uint8ClampedArray.
 *
 * Algorithm:
 *   1. Read the target colour at (startX, startY).
 *   2. If target == fill colour, bail out.
 *   3. Push seed scanline segment onto a stack.
 *   4. For each segment, scan left and right to find the full span.
 *   5. Fill the span; check row above and below for connected unfilled pixels.
 *
 * Tolerance: Chebyshev distance across all 4 channels (r, g, b, a).
 *
 * NOTE: The caller is responsible for calling ctx.getImageData / putImageData.
 * This function mutates the array in place.
 */
import { withinTolerance } from "~/paint/lib/colour";

export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  tolerance: number,
): void {
  startX = Math.round(startX);
  startY = Math.round(startY);
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const idx = (x: number, y: number) => (y * width + x) * 4;

  const seedIdx = idx(startX, startY);
  const targetR = pixels[seedIdx];
  const targetG = pixels[seedIdx + 1];
  const targetB = pixels[seedIdx + 2];
  const targetA = pixels[seedIdx + 3];

  // If the seed pixel already matches the fill colour, nothing to do.
  if (
    withinTolerance(targetR, targetG, targetB, targetA, fillR, fillG, fillB, fillA, 0)
  ) return;

  function matches(x: number, y: number): boolean {
    const i = idx(x, y);
    return withinTolerance(
      pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3],
      targetR, targetG, targetB, targetA,
      tolerance,
    );
  }

  function paint(x: number, y: number): void {
    const i = idx(x, y);
    pixels[i] = fillR;
    pixels[i + 1] = fillG;
    pixels[i + 2] = fillB;
    pixels[i + 3] = fillA;
  }

  // Stack of [leftX, rightX, y, parentY] segments.
  const stack: Array<[number, number, number, number]> = [];

  // Seed: find the full horizontal span at startY.
  let l = startX;
  while (l > 0 && matches(l - 1, startY)) l--;
  let r = startX;
  while (r < width - 1 && matches(r + 1, startY)) r++;
  stack.push([l, r, startY, startY - 1]);

  while (stack.length > 0) {
    const [left, right, y, fromY] = stack.pop()!;

    // Fill this span.
    for (let x = left; x <= right; x++) {
      paint(x, y);
    }

    // Scan lines above and below.
    for (const dy of [-1, 1]) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      // Skip if this is the line we came from (already filled there).
      if (ny === fromY) continue;

      let x = left;
      while (x <= right) {
        // Find the start of an unfilled run.
        while (x <= right && !matches(x, ny)) x++;
        if (x > right) break;
        // Extend left beyond the parent span.
        let nl = x;
        while (nl > 0 && matches(nl - 1, ny)) nl--;
        // Extend right.
        let nr = x;
        while (nr < width - 1 && matches(nr + 1, ny)) nr++;
        stack.push([nl, nr, ny, y]);
        x = nr + 1;
      }
    }
  }
}
