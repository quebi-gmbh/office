import { describe, expect, test } from "bun:test";
import {
  decodeSource,
  encodeSource,
  hashToSource,
  sourceToHash,
} from "./export-utils";

describe("typst share-link codec", () => {
  const samples = [
    "",
    "= Hello",
    '#set text(font: "Libertinus Serif")\n\nBody text.',
    "Unicode: café — π ≈ 3.14, 日本語, emoji 🎉",
    "line1\nline2\ttabbed\n\n#let x = 1",
  ];

  test("encode/decode round-trips (incl. non-ASCII)", () => {
    for (const s of samples) {
      expect(decodeSource(encodeSource(s))).toBe(s);
    }
  });

  test("sourceToHash/hashToSource round-trips", () => {
    for (const s of samples) {
      const hash = sourceToHash(s);
      expect(hash.startsWith("#src=")).toBe(true);
      expect(hashToSource(hash)).toBe(s);
    }
  });

  test("hashToSource returns null for non-matching or malformed hashes", () => {
    expect(hashToSource("")).toBeNull();
    expect(hashToSource("#other=abc")).toBeNull();
    expect(hashToSource("#src=@@not-base64@@")).toBeNull();
  });
});
