/**
 * Settings drawer for the document editor.
 * Sections: Page · Typography · Behaviour · Theme
 *
 * Mirrors app/lib/code-editor/settings-drawer.tsx:
 * - Every control's onChange calls update({section:{field}}) — live, no save button.
 * - Reset to defaults via Drawer's headerAction slot.
 */
import { Drawer } from "~/components/Drawer";
import { SettingsRow, SettingsSection } from "~/components/SettingsRow";
import { useDocsSettings } from "./settings-context";
import type { DocSettings } from "./settings";

// ── Small control helpers ─────────────────────────────────────────────────────

const Toggle = ({
  id,
  checked,
  onChange,
}: {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
      checked ? "bg-accent" : "bg-border"
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

const Select = ({
  id,
  value,
  onChange,
  options,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  <select
    id={id}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="rounded border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const NumberInput = ({
  id,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) => (
  <input
    id={id}
    type="number"
    value={value}
    min={min}
    max={max}
    step={step ?? 1}
    onChange={(e) => {
      const n = Number(e.target.value);
      if (!isNaN(n) && n >= min && n <= max) onChange(n);
    }}
    className="w-16 rounded border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
  />
);

// ── Main component ────────────────────────────────────────────────────────────

type DocSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function DocSettingsDrawer({ open, onClose }: DocSettingsDrawerProps) {
  const { settings, update, reset } = useDocsSettings();

  const resetButton = (
    <button
      type="button"
      onClick={reset}
      className="rounded px-2 py-1 text-xs text-muted hover:bg-border hover:text-fg transition-colors"
    >
      Reset to defaults
    </button>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Document settings"
      headerAction={resetButton}
    >
      {/* ── Page ── */}
      <SettingsSection title="Page">
        <SettingsRow label="Content width" htmlFor="ds-width">
          <Select
            id="ds-width"
            value={settings.page.width}
            onChange={(v) =>
              update({ page: { width: v as DocSettings["page"]["width"] } })
            }
            options={[
              { value: "narrow",      label: "Narrow (640 px)" },
              { value: "comfortable", label: "Comfortable (800 px)" },
              { value: "wide",        label: "Wide (1000 px)" },
              { value: "full",        label: "Full width" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Typography ── */}
      <SettingsSection title="Typography">
        <SettingsRow label="Font family" htmlFor="ds-fontFamily">
          <Select
            id="ds-fontFamily"
            value={settings.typography.fontFamily}
            onChange={(v) =>
              update({
                typography: {
                  fontFamily: v as DocSettings["typography"]["fontFamily"],
                },
              })
            }
            options={[
              { value: "sans",  label: "Sans-serif (system)" },
              { value: "serif", label: "Serif (Georgia)" },
              { value: "mono",  label: "Monospace" },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Font size (px)" htmlFor="ds-fontSize">
          <NumberInput
            id="ds-fontSize"
            value={settings.typography.fontSizeBase}
            min={10}
            max={28}
            onChange={(v) =>
              update({ typography: { fontSizeBase: v } })
            }
          />
        </SettingsRow>

        <SettingsRow label="Line height" htmlFor="ds-lineHeight">
          <NumberInput
            id="ds-lineHeight"
            value={settings.typography.lineHeight}
            min={1.0}
            max={3.0}
            step={0.1}
            onChange={(v) =>
              update({ typography: { lineHeight: v } })
            }
          />
        </SettingsRow>

        <SettingsRow label="Paragraph spacing (em)" htmlFor="ds-paraSpacing">
          <NumberInput
            id="ds-paraSpacing"
            value={settings.typography.paragraphSpacing}
            min={0}
            max={3}
            step={0.25}
            onChange={(v) =>
              update({ typography: { paragraphSpacing: v } })
            }
          />
        </SettingsRow>

        <SettingsRow
          label="First-line indent (em)"
          description="Indent the first line of each paragraph (0 = off)."
          htmlFor="ds-indent"
        >
          <NumberInput
            id="ds-indent"
            value={settings.typography.firstLineIndent}
            min={0}
            max={4}
            step={0.5}
            onChange={(v) =>
              update({ typography: { firstLineIndent: v } })
            }
          />
        </SettingsRow>

        <SettingsRow label="List numbering style" htmlFor="ds-listStyle">
          <Select
            id="ds-listStyle"
            value={settings.typography.listStyle}
            onChange={(v) =>
              update({
                typography: { listStyle: v as DocSettings["typography"]["listStyle"] },
              })
            }
            options={[
              { value: "decimal",     label: "1, 2, 3 (decimal)" },
              { value: "lower-alpha", label: "a, b, c (lower alpha)" },
              { value: "lower-roman", label: "i, ii, iii (lower roman)" },
              { value: "upper-alpha", label: "A, B, C (upper alpha)" },
              { value: "upper-roman", label: "I, II, III (upper roman)" },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label="Smart typography"
          description="Convert -- to em-dash, straight quotes to curly, etc. Requires a brief editor reload."
          htmlFor="ds-smartTypo"
        >
          <Toggle
            id="ds-smartTypo"
            checked={settings.typography.smartTypography}
            onChange={(v) =>
              update({ typography: { smartTypography: v } })
            }
          />
        </SettingsRow>

        <SettingsRow
          label="Custom CSS"
          description="CSS injected scoped to .ProseMirror. Use with caution."
          htmlFor="ds-customCss"
        >
          <textarea
            id="ds-customCss"
            value={settings.typography.customCss}
            rows={4}
            spellCheck={false}
            placeholder={"/* e.g. */\np { text-align: justify; }"}
            onChange={(e) =>
              update({ typography: { customCss: e.target.value } })
            }
            className="w-full rounded border border-border bg-bg px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none"
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Behaviour ── */}
      <SettingsSection title="Behaviour">
        <SettingsRow
          label="Focus mode"
          description="Hide toolbar and sidebars. Press F11 to toggle."
          htmlFor="ds-focusMode"
        >
          <Toggle
            id="ds-focusMode"
            checked={settings.behaviour.focusMode}
            onChange={(v) => update({ behaviour: { focusMode: v } })}
          />
        </SettingsRow>

        <SettingsRow
          label="Typewriter mode"
          description="Keep the active line centred while typing."
          htmlFor="ds-typewriter"
        >
          <Toggle
            id="ds-typewriter"
            checked={settings.behaviour.typewriterMode}
            onChange={(v) => update({ behaviour: { typewriterMode: v } })}
          />
        </SettingsRow>

        <SettingsRow
          label="Target word count"
          description="Show a progress bar in the status bar (0 = off)."
          htmlFor="ds-targetWords"
        >
          <NumberInput
            id="ds-targetWords"
            value={settings.behaviour.targetWords}
            min={0}
            max={100000}
            step={100}
            onChange={(v) => update({ behaviour: { targetWords: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Spell check" htmlFor="ds-spellCheck">
          <Toggle
            id="ds-spellCheck"
            checked={settings.behaviour.spellCheck}
            onChange={(v) => update({ behaviour: { spellCheck: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Autosave" htmlFor="ds-autosave">
          <Select
            id="ds-autosave"
            value={String(settings.behaviour.autosaveMs)}
            onChange={(v) =>
              update({
                behaviour: {
                  autosaveMs: Number(v) as DocSettings["behaviour"]["autosaveMs"],
                },
              })
            }
            options={[
              { value: "500",  label: "500 ms" },
              { value: "1000", label: "1 s" },
              { value: "5000", label: "5 s" },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label="Auto-snapshot interval"
          description="Periodically save a version snapshot (0 = off)."
          htmlFor="ds-versionInterval"
        >
          <Select
            id="ds-versionInterval"
            value={String(settings.behaviour.versionIntervalMin)}
            onChange={(v) =>
              update({ behaviour: { versionIntervalMin: Number(v) } })
            }
            options={[
              { value: "0",  label: "Off" },
              { value: "5",  label: "Every 5 min" },
              { value: "10", label: "Every 10 min" },
              { value: "30", label: "Every 30 min" },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label="Outline panel"
          description="Auto shows the outline when the document has headings."
          htmlFor="ds-outline"
        >
          <Select
            id="ds-outline"
            value={settings.behaviour.outline}
            onChange={(v) =>
              update({
                behaviour: {
                  outline: v as DocSettings["behaviour"]["outline"],
                },
              })
            }
            options={[
              { value: "auto",   label: "Auto" },
              { value: "always", label: "Always" },
              { value: "off",    label: "Off" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

    </Drawer>
  );
}
