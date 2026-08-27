import { describe, expect, it } from "bun:test";
import {
  MIN_THUMB,
  axisScroll,
  panForThumbDrag,
  panForTrackClick,
} from "~/paint/lib/scrollbars";

describe("axisScroll", () => {
  it("reports no overflow when the content fits inside the pane", () => {
    // 400px of content centred in an 800px pane.
    const a = axisScroll(200, 400, 800);
    expect(a.overflow).toBe(false);
    expect(a.maxScroll).toBe(0);
    expect(a.thumbOffset).toBe(0);
  });

  it("reports no overflow when the content exactly fills the pane", () => {
    expect(axisScroll(0, 800, 800).overflow).toBe(false);
  });

  it("ignores sub-pixel overflow so the bar does not flicker", () => {
    expect(axisScroll(0, 800.3, 800).overflow).toBe(false);
    expect(axisScroll(0, 802, 800).overflow).toBe(true);
  });

  it("overflows once the zoomed content is larger than the pane", () => {
    // 1600px of content, scrolled to the middle.
    const a = axisScroll(-400, 1600, 800);
    expect(a.overflow).toBe(true);
    expect(a.total).toBe(1600);
    expect(a.scroll).toBe(400);
    expect(a.maxScroll).toBe(800);
    // Half the content is visible → thumb is half the track…
    expect(a.thumb).toBe(400);
    // …and centred, because we are exactly half-scrolled.
    expect(a.thumbOffset).toBe(200);
  });

  it("pins the thumb to each end of the track at the scroll extremes", () => {
    expect(axisScroll(0, 1600, 800).thumbOffset).toBe(0);
    const end = axisScroll(-800, 1600, 800);
    expect(end.thumbOffset).toBeCloseTo(end.track - end.thumb, 6);
  });

  it("counts pane space the content has been panned away from", () => {
    // Content pushed fully to the right of the pane: universe = [0, 1200].
    const a = axisScroll(400, 800, 800);
    expect(a.overflow).toBe(true);
    expect(a.total).toBe(1200);
    expect(a.scroll).toBe(0);
    expect(a.maxScroll).toBe(400);
  });

  it("clamps the thumb to a grabbable minimum when deeply zoomed", () => {
    const a = axisScroll(0, 100_000, 800);
    // Proportional length would be ~6px.
    expect(a.thumb).toBe(MIN_THUMB);
  });

  it("scales the thumb to a shortened track without changing the pane maths", () => {
    const full = axisScroll(-400, 1600, 800);
    const short = axisScroll(-400, 1600, 800, 788);
    expect(short.maxScroll).toBe(full.maxScroll);
    expect(short.track).toBe(788);
    expect(short.thumb).toBeCloseTo(394, 6);
    expect(short.thumbOffset).toBeCloseTo(197, 6);
  });

  it("degenerates safely on a zero-sized or unmeasured pane", () => {
    expect(axisScroll(0, 1600, 0).overflow).toBe(false);
    expect(axisScroll(NaN, 1600, 800).overflow).toBe(false);
  });
});

describe("panForThumbDrag", () => {
  it("moves the content opposite to the thumb", () => {
    const a = axisScroll(0, 1600, 800);
    // Track 800, thumb 400 → 400px of travel maps onto 800px of scroll, so the
    // pan moves twice as far as the pointer.
    expect(panForThumbDrag(a, 0, 100)).toBeCloseTo(-200, 6);
    expect(panForThumbDrag(a, 0, -100)).toBeCloseTo(0, 6); // clamped at the start
  });

  it("clamps at both ends of the track", () => {
    const a = axisScroll(-400, 1600, 800);
    expect(panForThumbDrag(a, -400, 10_000)).toBeCloseTo(-800, 6);
    expect(panForThumbDrag(a, -400, -10_000)).toBeCloseTo(0, 6);
  });

  it("reaches exactly the end of the universe when dragged the full travel", () => {
    const a = axisScroll(0, 1600, 800);
    const travel = a.track - a.thumb;
    expect(panForThumbDrag(a, 0, travel)).toBeCloseTo(-a.maxScroll, 6);
  });

  it("is a no-op when nothing overflows", () => {
    const a = axisScroll(200, 400, 800);
    expect(panForThumbDrag(a, 200, 250)).toBe(200);
  });

  it("is a no-op when the thumb fills its track", () => {
    // Minimum-thumb clamping can leave no travel on a very short track.
    const a = axisScroll(0, 100_000, 800, MIN_THUMB);
    expect(a.track - a.thumb).toBe(0);
    expect(panForThumbDrag(a, 0, 50)).toBe(0);
  });
});

describe("panForTrackClick", () => {
  it("centres the thumb on the click", () => {
    const a = axisScroll(0, 1600, 800);
    // Click at the far end of an 800px track: thumb (400) centres at 600 →
    // offset 400, which is the whole 400px of travel → full scroll.
    expect(panForTrackClick(a, 0, 800)).toBeCloseTo(-a.maxScroll, 6);
    // Click at the very start pins the thumb to 0 → no scroll.
    expect(panForTrackClick(a, 0, 0)).toBeCloseTo(0, 6);
  });

  it("round-trips the current position back to the same pan", () => {
    const a = axisScroll(-500, 2400, 800);
    const centreOfThumb = a.thumbOffset + a.thumb / 2;
    expect(panForTrackClick(a, -500, centreOfThumb)).toBeCloseTo(-500, 6);
  });

  it("is a no-op when nothing overflows", () => {
    const a = axisScroll(200, 400, 800);
    expect(panForTrackClick(a, 200, 700)).toBe(200);
  });
});
