/**
 * Per-tool settings for /table — currently the locale that drives number
 * parsing/formatting and ambiguous-date interpretation. Persisted to
 * localStorage; mirrors the settings shape used by /code and /docs.
 */
import { localeFromTag, type Locale } from "./coltypes";

export interface TableSettings {
  /** BCP-47 locale tag, or "" to follow the browser. */
  localeTag: string;
  /** Override day/month order for ambiguous numeric dates. */
  dateOrder: "auto" | "dmy" | "mdy";
}

const KEY = "office:table:settings";

export function defaultSettings(): TableSettings {
  return { localeTag: "", dateOrder: "auto" };
}

export function loadSettings(): TableSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultSettings(), ...(JSON.parse(raw) as Partial<TableSettings>) };
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

export function saveSettings(s: TableSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Resolve the effective Locale (separators + date order) from settings. */
export function resolveLocale(s: TableSettings): Locale {
  const tag =
    s.localeTag ||
    (typeof navigator !== "undefined" ? navigator.language : "en-US") ||
    "en-US";
  const loc = localeFromTag(tag);
  if (s.dateOrder === "dmy") loc.dayFirst = true;
  else if (s.dateOrder === "mdy") loc.dayFirst = false;
  return loc;
}
