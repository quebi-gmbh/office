/**
 * React context for code editor settings.
 * Wraps localStorage persistence and schema migration.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FC, PropsWithChildren } from "react";
import {
  SETTINGS_STORAGE_KEY,
  defaults,
  migrate,
} from "./settings";
import type { CodeSettings } from "./settings";

// ── Context type ─────────────────────────────────────────────────────────────
type SettingsContextValue = {
  settings: CodeSettings;
  update: (partial: DeepPartial<CodeSettings>) => void;
  reset: () => void;
};

// Helper: deep partial
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// ── Deep merge ────────────────────────────────────────────────────────────────
function deepMerge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[key];
    if (pv !== undefined) {
      const bv = base[key];
      if (bv !== null && typeof bv === "object" && typeof pv === "object") {
        (result as Record<keyof T, unknown>)[key] = deepMerge(
          bv as object,
          pv as DeepPartial<object>,
        );
      } else {
        (result as Record<keyof T, unknown>)[key] = pv;
      }
    }
  }
  return result;
}

// ── Provider ─────────────────────────────────────────────────────────────────
export const SettingsProvider: FC<PropsWithChildren> = ({ children }) => {
  const [settings, setSettings] = useState<CodeSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return migrate(raw ? JSON.parse(raw) : null);
    } catch {
      return defaults;
    }
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback((partial: DeepPartial<CodeSettings>) => {
    setSettings((prev) => deepMerge(prev, partial));
  }, []);

  const reset = useCallback(() => {
    setSettings(defaults);
  }, []);

  const value = useMemo(
    () => ({ settings, update, reset }),
    [settings, update, reset],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useCodeSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useCodeSettings must be used within <SettingsProvider>");
  }
  return ctx;
}
