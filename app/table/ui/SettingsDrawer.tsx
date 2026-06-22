/**
 * /table settings drawer — locale (number + date interpretation). Mirrors the
 * visual style of the /code and /docs drawers (Drawer + SettingsRow).
 */
import { Drawer } from "~/components/Drawer";
import { SettingsRow, SettingsSection } from "~/components/SettingsRow";
import type { TableSettings } from "~/table/lib/settings";

const LOCALES = [
  { tag: "", label: "Browser default" },
  { tag: "en-US", label: "English (US) — 1,234.56" },
  { tag: "en-GB", label: "English (UK) — 1,234.56" },
  { tag: "de-DE", label: "German — 1.234,56" },
  { tag: "fr-FR", label: "French — 1 234,56" },
  { tag: "es-ES", label: "Spanish — 1.234,56" },
  { tag: "it-IT", label: "Italian — 1.234,56" },
  { tag: "pt-BR", label: "Portuguese (BR) — 1.234,56" },
  { tag: "nl-NL", label: "Dutch — 1.234,56" },
  { tag: "ja-JP", label: "Japanese — 1,234.56" },
];

const ctl = "rounded border border-border bg-card px-2 py-1 text-sm";

export function SettingsDrawer({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: TableSettings;
  onChange: (next: TableSettings) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Table settings">
      <SettingsSection title="Locale">
        <SettingsRow label="Number locale" description="Controls decimal & thousands separators when parsing and displaying numbers.">
          <select
            className={ctl}
            value={settings.localeTag}
            onChange={(e) => onChange({ ...settings, localeTag: e.target.value })}
          >
            {LOCALES.map((l) => (
              <option key={l.tag} value={l.tag}>{l.label}</option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label="Date order" description="How to read ambiguous numeric dates like 03/04/2025.">
          <select
            className={ctl}
            value={settings.dateOrder}
            onChange={(e) => onChange({ ...settings, dateOrder: e.target.value as TableSettings["dateOrder"] })}
          >
            <option value="auto">Auto (from locale)</option>
            <option value="dmy">Day / Month / Year</option>
            <option value="mdy">Month / Day / Year</option>
          </select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Formulas">
        <SettingsRow label="Export formulas as text" description="Exports keep the =… source instead of the evaluated value.">
          <input
            type="checkbox"
            checked={settings.exportFormulasAsText}
            onChange={(e) => onChange({ ...settings, exportFormulasAsText: e.target.checked })}
            className="accent-accent"
          />
        </SettingsRow>
      </SettingsSection>
    </Drawer>
  );
}
