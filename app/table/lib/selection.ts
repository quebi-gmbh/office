/**
 * Grid selection geometry — a rectangular range anchored at `anchor`, with the
 * moving end at `focus`. Normalised bounds are derived on demand.
 */
import type { CellPos } from "./model";

export interface Selection {
  anchor: CellPos;
  focus: CellPos;
}

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export function singleCell(r: number, c: number): Selection {
  return { anchor: { r, c }, focus: { r, c } };
}

export function rectOf(sel: Selection): Rect {
  return {
    r0: Math.min(sel.anchor.r, sel.focus.r),
    c0: Math.min(sel.anchor.c, sel.focus.c),
    r1: Math.max(sel.anchor.r, sel.focus.r),
    c1: Math.max(sel.anchor.c, sel.focus.c),
  };
}

export function inRect(rect: Rect, r: number, c: number): boolean {
  return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
}

export function isSingle(sel: Selection): boolean {
  return sel.anchor.r === sel.focus.r && sel.anchor.c === sel.focus.c;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
