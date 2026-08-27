/**
 * Scrollbar geometry for the paint canvas viewport.
 *
 * The viewport is a CSS `translate(pan) scale(zoom)` on the canvas wrapper, so
 * the outer element has no native scrollable overflow. We therefore derive
 * scrollbar thumbs from the transform instead.
 *
 * Model (one axis at a time, all values in CSS px within the outer element):
 *
 *   content occupies  [pan, pan + contentLen]
 *   the visible pane  [0,   viewLen]
 *
 * The "scroll universe" is the union of the two — that keeps the thumb honest
 * even when the user has flung the document entirely off-screen, which the free
 * pan gestures (wheel, space-drag, pinch) allow.
 *
 *   universe = [min(pan, 0), max(pan + contentLen, viewLen)]
 *   scroll   = distance from the universe start to the pane start = max(0, -pan)
 *
 * Overflow (and therefore a visible scrollbar) is exactly `universe > viewLen`.
 *
 * `trackLen` is kept separate from `viewLen` because the two bars overlay the
 * pane: when both are visible each track is shortened to leave the corner free,
 * while the pane it represents is still the full width/height.
 */

/** Minimum thumb length in px, so a deeply zoomed document is still grabbable. */
export const MIN_THUMB = 28;

export interface AxisScroll {
  /** True when the universe is longer than the pane — i.e. content is off-screen. */
  overflow: boolean;
  /** Length of the scroll universe, px. */
  total: number;
  /** Current scroll offset within the universe, px (0 … maxScroll). */
  scroll: number;
  /** Largest valid scroll offset, px. */
  maxScroll: number;
  /** Length of the track the thumb slides in, px. */
  track: number;
  /** Thumb length along the track, px (never below MIN_THUMB unless the track is shorter). */
  thumb: number;
  /** Thumb offset from the track start, px. */
  thumbOffset: number;
}

const EMPTY: AxisScroll = {
  overflow: false,
  total: 0,
  scroll: 0,
  maxScroll: 0,
  track: 0,
  thumb: 0,
  thumbOffset: 0,
};

/**
 * Derive one axis of scrollbar geometry.
 *
 * @param pan        translation of the content in outer-element px
 * @param contentLen scaled content length (doc length × zoom)
 * @param viewLen    length of the visible pane
 * @param trackLen   length of the scrollbar track; defaults to `viewLen`
 */
export function axisScroll(
  pan: number,
  contentLen: number,
  viewLen: number,
  trackLen: number = viewLen,
): AxisScroll {
  if (!(viewLen > 0) || !Number.isFinite(pan) || !Number.isFinite(contentLen)) {
    return EMPTY;
  }

  const start = Math.min(pan, 0);
  const end = Math.max(pan + contentLen, viewLen);
  const total = end - start;
  const scroll = Math.max(0, -pan); // === -start, but never -0
  const maxScroll = Math.max(0, total - viewLen);

  // Sub-pixel slack: a 0.5px rounding difference should not flash a scrollbar.
  const overflow = maxScroll > 0.5;

  const track = Math.max(0, trackLen);
  const thumb = Math.min(track, Math.max(MIN_THUMB, (viewLen / total) * track));
  const travel = Math.max(0, track - thumb);
  const thumbOffset = maxScroll > 0 ? (scroll / maxScroll) * travel : 0;

  return { overflow, total, scroll, maxScroll, track, thumb, thumbOffset };
}

/**
 * Map a thumb drag to a new pan value.
 *
 * Geometry is frozen at drag start (`axis`, `pan0`) so the universe cannot grow
 * underneath the cursor as the content moves — without that the thumb would
 * shrink away from the pointer and never reach the end of its track.
 *
 * @param axis    geometry captured when the drag began
 * @param pan0    pan value when the drag began
 * @param deltaPx pointer movement along the track since the drag began
 */
export function panForThumbDrag(axis: AxisScroll, pan0: number, deltaPx: number): number {
  const travel = axis.track - axis.thumb;
  if (travel <= 0 || axis.maxScroll <= 0) return pan0;
  const scroll = clamp(axis.scroll + (deltaPx / travel) * axis.maxScroll, 0, axis.maxScroll);
  // Scrolling forward (scroll ↑) moves the content back (pan ↓).
  return pan0 - (scroll - axis.scroll);
}

/**
 * Map a click on the scrollbar track to a new pan value: centre the thumb on
 * the click, which is what every current browser does for a track click.
 *
 * @param posPx pointer position along the track, measured from its start
 */
export function panForTrackClick(axis: AxisScroll, pan: number, posPx: number): number {
  const travel = axis.track - axis.thumb;
  if (travel <= 0 || axis.maxScroll <= 0) return pan;
  const target = clamp(posPx - axis.thumb / 2, 0, travel);
  const scroll = (target / travel) * axis.maxScroll;
  return pan - (scroll - axis.scroll);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
