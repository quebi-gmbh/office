/**
 * Colour utilities — hex ↔ rgba, tolerance comparison.
 * All hex values are expected as lowercase 6-digit strings (#rrggbb).
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse a 6-digit hex colour string to an RGBA object (alpha = 255). */
export function hexToRgba(hex: string): RGBA {
  const n = parseInt(hex.replace("#", ""), 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
    a: 255,
  };
}

/** Convert an RGBA object to a lowercase 6-digit hex string. */
export function rgbaToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalise any CSS colour string to lowercase #rrggbb.
 * Only handles #rgb, #rrggbb and rgb() — enough for our picker inputs.
 */
export function normaliseHex(colour: string): string {
  colour = colour.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(colour)) return colour;
  if (/^#[0-9a-f]{3}$/.test(colour)) {
    const [, a, b, c] = colour;
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  // rgb(r, g, b) shorthand
  const m = colour.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return rgbaToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  return colour; // pass through unknown formats
}

/**
 * Whether two pixels are "close enough" within the given tolerance.
 * Tolerance is the maximum Chebyshev distance across r, g, b, a channels.
 */
export function withinTolerance(
  r1: number, g1: number, b1: number, a1: number,
  r2: number, g2: number, b2: number, a2: number,
  tolerance: number,
): boolean {
  return (
    Math.abs(r1 - r2) <= tolerance &&
    Math.abs(g1 - g2) <= tolerance &&
    Math.abs(b1 - b2) <= tolerance &&
    Math.abs(a1 - a2) <= tolerance
  );
}
