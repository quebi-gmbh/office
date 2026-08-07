import { describe, expect, test } from "bun:test";
import {
  cleanLabel, detectFields, detectRules, detectUnderscoreRuns, inferLabel,
  mergeRules, overlapRatio, DEFAULT_DETECT_OPTIONS,
  type PageSignals, type TextSpan,
} from "./detect-fields";

const OPTS = DEFAULT_DETECT_OPTIONS;

function page(over: Partial<PageSignals> = {}): PageSignals {
  return { page: 0, width: 595, height: 842, texts: [], rules: [], ...over };
}

/** A text run whose width is a plausible 5pt per character. */
function text(str: string, x: number, y: number, size = 10): TextSpan {
  return { str, x, y, w: str.length * size * 0.5, h: size };
}

// ── Underscore runs ──────────────────────────────────────────────────────────

describe("detectUnderscoreRuns", () => {
  test("spans the run, not the label", () => {
    // "Name: " is 6 chars, then 20 underscores; 5pt per char.
    const span = text("Name: ____________________", 60, 300);
    const [field] = detectUnderscoreRuns(page({ texts: [span] }), OPTS);
    expect(field).toBeDefined();
    expect(field!.x).toBeCloseTo(60 + 6 * 5, 4);
    expect(field!.w).toBeCloseTo(20 * 5, 4);
    // Sits on the run's baseline, growing upwards.
    expect(field!.y + field!.h).toBeCloseTo(310, 4);
    expect(field!.source).toBe("underscore");
  });

  test("finds every run in one line", () => {
    const span = text("First __________________ Last __________________", 40, 100);
    expect(detectUnderscoreRuns(page({ texts: [span] }), OPTS)).toHaveLength(2);
  });

  test("ignores stray underscores and short runs", () => {
    const texts = [text("snake_case_identifier", 40, 100), text("a __ b", 40, 140)];
    expect(detectUnderscoreRuns(page({ texts }), OPTS)).toHaveLength(0);
  });
});

// ── Rules ────────────────────────────────────────────────────────────────────

describe("detectRules", () => {
  test("a long thin line becomes a field resting on it", () => {
    const [field] = detectRules(page({ rules: [{ x: 100, y: 400, w: 300, h: 0.8 }] }), OPTS);
    expect(field).toBeDefined();
    expect(field!.y + field!.h).toBeCloseTo(400, 4);
    expect(field!.x).toBeCloseTo(101, 4);
    expect(field!.w).toBeCloseTo(298, 4);
    expect(field!.source).toBe("rule");
  });

  test("ignores short segments, thick blocks and full-width dividers", () => {
    const rules = [
      { x: 100, y: 200, w: 12, h: 0.7 },   // too short
      { x: 100, y: 250, w: 300, h: 9 },    // a filled block, not a line
      { x: 10, y: 300, w: 575, h: 0.7 },   // page divider
      { x: 100, y: 10, w: 300, h: 0.7 },   // header rule
    ];
    expect(detectRules(page({ rules }), OPTS)).toHaveLength(0);
  });

  test("a line under printed text is an underline, not a blank", () => {
    const signals = page({
      rules: [{ x: 100, y: 400, w: 300, h: 0.7 }],
      texts: [text("Terms and conditions apply here", 100, 386)],
    });
    expect(detectRules(signals, OPTS)).toHaveLength(0);
  });

  test("mergeRules joins a line chopped into segments", () => {
    const merged = mergeRules([
      { x: 100, y: 400, w: 100, h: 0.7 },
      { x: 201, y: 400.3, w: 100, h: 0.7 },
      { x: 100, y: 500, w: 100, h: 0.7 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ x: 100, w: 201 });
  });
});

// ── Labels ───────────────────────────────────────────────────────────────────

describe("labels", () => {
  test("cleanLabel strips form decoration", () => {
    expect(cleanLabel("Name:")).toBe("Name");
    expect(cleanLabel("  Date of birth ______ ")).toBe("Date of birth");
    expect(cleanLabel("* Email *")).toBe("Email");
  });

  test("prefers the nearest text to the left on the same line", () => {
    const texts = [text("Surname:", 60, 296), text("Something else", 60, 200)];
    const label = inferLabel({ x: 120, y: 292, w: 200, h: 14 }, texts, OPTS.labelReach);
    expect(label).toBe("Surname");
  });

  test("falls back to the text directly above", () => {
    const texts = [text("Street address", 100, 380)];
    const label = inferLabel({ x: 100, y: 396, w: 200, h: 14 }, texts, OPTS.labelReach);
    expect(label).toBe("Street address");
  });

  test("ignores text that is too far away", () => {
    const texts = [text("Faraway", 10, 296)];
    const label = inferLabel({ x: 500, y: 292, w: 80, h: 14 }, texts, OPTS.labelReach);
    expect(label).toBeNull();
  });
});

// ── End to end ───────────────────────────────────────────────────────────────

describe("detectFields", () => {
  test("names fields after their labels, deduping as it goes", () => {
    const signals = page({
      texts: [
        text("Name:", 60, 296),
        text("Name:", 60, 396),
      ],
      rules: [
        { x: 120, y: 310, w: 300, h: 0.7 },
        { x: 120, y: 410, w: 300, h: 0.7 },
      ],
    });
    const { fields } = detectFields([signals]);
    expect(fields.map((f) => f.name)).toEqual(["name", "name_2"]);
    expect(fields.every((f) => f.status === "proposed")).toBe(true);
    expect(fields.every((f) => f.kind === "text")).toBe(true);
    expect(fields[0]!.label).toBe("Name");
  });

  test("existing names are never reused", () => {
    const signals = page({
      texts: [text("Name:", 60, 296)],
      rules: [{ x: 120, y: 310, w: 300, h: 0.7 }],
    });
    const { fields } = detectFields([signals], {}, ["name", "name_2"]);
    expect(fields[0]!.name).toBe("name_3");
  });

  test("an underline drawn under an underscore run counts once", () => {
    const signals = page({
      texts: [text("Name: ____________________", 60, 300)],
      rules: [{ x: 90, y: 310, w: 100, h: 0.7 }],
    });
    const { fields } = detectFields([signals]);
    expect(fields).toHaveLength(1);
    // The text-derived measurement wins — it's the more precise one.
    expect(fields[0]!.source).toBe("underscore");
  });

  test("near-identical rules (a line drawn twice) produce one field", () => {
    const signals = page({
      // 2pt apart: too far to merge as one segment, close enough to be the
      // same line drawn twice (a stroke plus a hairline fill, say).
      rules: [
        { x: 100, y: 400, w: 300, h: 0.7 },
        { x: 100, y: 402, w: 300, h: 0.7 },
      ],
    });
    const { fields, duplicates } = detectFields([signals]);
    expect(fields).toHaveLength(1);
    expect(duplicates).toBe(1);
  });

  test("results come back in reading order, across pages", () => {
    const one = page({
      rules: [
        { x: 100, y: 500, w: 300, h: 0.7 },
        { x: 100, y: 300, w: 300, h: 0.7 },
      ],
    });
    const two = page({ page: 1, rules: [{ x: 100, y: 200, w: 300, h: 0.7 }] });
    const { fields } = detectFields([one, two]);
    expect(fields.map((f) => [f.page, f.y])).toEqual([
      [0, 285], [0, 485], [1, 185],
    ]);
  });

  test("a page with nothing to go on yields nothing", () => {
    expect(detectFields([page()]).fields).toEqual([]);
  });
});

describe("overlapRatio", () => {
  test("is 1 when one box contains the other", () => {
    expect(overlapRatio(
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 10, y: 10, w: 10, h: 10 },
    )).toBeCloseTo(1, 6);
  });

  test("is 0 for disjoint boxes", () => {
    expect(overlapRatio(
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 20, w: 10, h: 10 },
    )).toBe(0);
  });
});
