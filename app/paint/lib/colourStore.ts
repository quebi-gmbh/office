/**
 * Colour preferences persistence.
 *
 * Persists FG, BG, and recent colour list to localStorage under
 * the key 'office:paint:colour'. Loading happens once at startup;
 * saving happens any time the colours change (via engine hooks).
 *
 * All colours stored as lowercase #rrggbb hex. 'transparent' is a special
 * allowed value for BG only.
 *
 * This module is imported by the engine to restore persisted colours on mount.
 */
import { normaliseHex } from "~/paint/lib/colour";

const STORAGE_KEY = "office:paint:colour";
const MAX_RECENTS = 10;

export interface PaintColourPrefs {
  fg: string;
  bg: string;
  recents: string[]; // up to 10, most-recent first, all lowercase #rrggbb
}

const DEFAULTS: PaintColourPrefs = {
  fg: "#1d4ed8",
  bg: "#ffffff",
  recents: [],
};

export function loadColourPrefs(): PaintColourPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PaintColourPrefs>;
    return {
      fg: parsed.fg ?? DEFAULTS.fg,
      bg: parsed.bg ?? DEFAULTS.bg,
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveColourPrefs(prefs: PaintColourPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing or storage quota exceeded — fail silently.
  }
}

/**
 * Add a colour to the recents list (move-to-front dedup, max 10 entries).
 * Returns a new array.
 */
export function addToRecents(recents: string[], colour: string): string[] {
  const norm = normaliseHex(colour);
  const filtered = recents.filter((c) => c !== norm);
  return [norm, ...filtered].slice(0, MAX_RECENTS);
}
