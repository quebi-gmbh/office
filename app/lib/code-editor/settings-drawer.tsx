/**
 * Settings drawer for the code editor.
 * Sections: Editor · Display · Files · Theme · Keymap
 */
import { Drawer } from "~/components/Drawer";
import { SettingsRow, SettingsSection } from "~/components/SettingsRow";
import { useCodeSettings } from "./settings-context";

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
      checked ? "bg-quebi-brand" : "bg-[#dfe4e8]"
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
  onChange,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) => (
  <input
    id={id}
    type="number"
    value={value}
    min={min}
    max={max}
    onChange={(e) => {
      const n = Number(e.target.value);
      if (!isNaN(n) && n >= min && n <= max) onChange(n);
    }}
    className="w-16 rounded border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
  />
);

// ── Main component ────────────────────────────────────────────────────────────

type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  initialFocus?: string; // e.g. "files.indent"
};

export function SettingsDrawer({ open, onClose, initialFocus: _initialFocus }: SettingsDrawerProps) {
  const { settings, update, reset } = useCodeSettings();

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
    <Drawer open={open} onClose={onClose} title="Settings" headerAction={resetButton}>

      {/* ── Editor ── */}
      <SettingsSection title="Editor">
        <SettingsRow label="Word wrap" htmlFor="s-wrap">
          <Select
            id="s-wrap"
            value={settings.editor.wrap}
            onChange={(v) => update({ editor: { wrap: v as "off" | "soft" } })}
            options={[
              { value: "off", label: "Off" },
              { value: "soft", label: "Soft wrap" },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Highlight active line" htmlFor="s-activeLine">
          <Toggle
            id="s-activeLine"
            checked={settings.editor.activeLine}
            onChange={(v) => update({ editor: { activeLine: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Bracket pair colorization" htmlFor="s-brackets">
          <Toggle
            id="s-brackets"
            checked={settings.editor.brackets}
            onChange={(v) => update({ editor: { brackets: v } })}
          />
        </SettingsRow>

        <SettingsRow
          label="Show inline diagnostics"
          description="Squiggles and diagnostic panel (requires #23)"
          htmlFor="s-diagnostics"
        >
          <Toggle
            id="s-diagnostics"
            checked={settings.editor.diagnostics}
            onChange={(v) => update({ editor: { diagnostics: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Display ── */}
      <SettingsSection title="Display">
        <SettingsRow label="Font family" htmlFor="s-fontFamily">
          <Select
            id="s-fontFamily"
            value={settings.display.fontFamily}
            onChange={(v) => update({ display: { fontFamily: v } })}
            options={[
              { value: "system", label: "System mono" },
              { value: "jetbrains-mono", label: "JetBrains Mono" },
              { value: "fira-code", label: "Fira Code" },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Font size (px)" htmlFor="s-fontSize">
          <NumberInput
            id="s-fontSize"
            value={settings.display.fontSize}
            min={8}
            max={32}
            onChange={(v) => update({ display: { fontSize: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Line height" htmlFor="s-lineHeight">
          <NumberInput
            id="s-lineHeight"
            value={settings.display.lineHeight}
            min={1}
            max={3}
            onChange={(v) => update({ display: { lineHeight: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Show line numbers" htmlFor="s-lineNumbers">
          <Toggle
            id="s-lineNumbers"
            checked={settings.display.lineNumbers}
            onChange={(v) => update({ display: { lineNumbers: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Show indent guides" htmlFor="s-indentGuides">
          <Toggle
            id="s-indentGuides"
            checked={settings.display.indentGuides}
            onChange={(v) => update({ display: { indentGuides: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Show whitespace" htmlFor="s-whitespace">
          <Toggle
            id="s-whitespace"
            checked={settings.display.whitespace}
            onChange={(v) => update({ display: { whitespace: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Highlight trailing whitespace" htmlFor="s-trailingWs">
          <Toggle
            id="s-trailingWs"
            checked={settings.display.trailingWhitespace}
            onChange={(v) => update({ display: { trailingWhitespace: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Show minimap" htmlFor="s-minimap">
          <Toggle
            id="s-minimap"
            checked={settings.display.minimap}
            onChange={(v) => update({ display: { minimap: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Files ── */}
      <SettingsSection title="Files">
        <SettingsRow label="Indent style" htmlFor="s-indent">
          <Select
            id="s-indent"
            value={settings.files.indent}
            onChange={(v) => update({ files: { indent: v as "spaces" | "tabs" } })}
            options={[
              { value: "spaces", label: "Spaces" },
              { value: "tabs", label: "Tabs" },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Tab width" htmlFor="s-tabWidth">
          <Select
            id="s-tabWidth"
            value={String(settings.files.tabWidth)}
            onChange={(v) => update({ files: { tabWidth: Number(v) as 1|2|3|4|5|6|7|8 } })}
            options={[1,2,3,4,5,6,7,8].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </SettingsRow>

        <SettingsRow label="Auto-detect indent" htmlFor="s-autoDetect">
          <Toggle
            id="s-autoDetect"
            checked={settings.files.autoDetectIndent}
            onChange={(v) => update({ files: { autoDetectIndent: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Line endings" htmlFor="s-eol">
          <Select
            id="s-eol"
            value={settings.files.eol}
            onChange={(v) => update({ files: { eol: v as "lf" | "crlf" | "auto" } })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "lf", label: "LF" },
              { value: "crlf", label: "CRLF" },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Insert final newline" htmlFor="s-finalNewline">
          <Toggle
            id="s-finalNewline"
            checked={settings.files.finalNewline}
            onChange={(v) => update({ files: { finalNewline: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Trim trailing whitespace on export" htmlFor="s-trimTrailing">
          <Toggle
            id="s-trimTrailing"
            checked={settings.files.trimTrailingOnExport}
            onChange={(v) => update({ files: { trimTrailingOnExport: v } })}
          />
        </SettingsRow>

        <SettingsRow label="Autosave" htmlFor="s-autosave">
          <Select
            id="s-autosave"
            value={String(settings.files.autosaveMs)}
            onChange={(v) => update({ files: { autosaveMs: Number(v) as 0|500|1000|5000 } })}
            options={[
              { value: "0", label: "Off" },
              { value: "500", label: "500 ms" },
              { value: "1000", label: "1 s" },
              { value: "5000", label: "5 s" },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Restore language on reload" htmlFor="s-restoreLang">
          <Toggle
            id="s-restoreLang"
            checked={settings.files.restoreLanguage}
            onChange={(v) => update({ files: { restoreLanguage: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Theme ── */}
      <SettingsSection title="Theme">
        <SettingsRow label="Color mode" htmlFor="s-themeMode">
          <Select
            id="s-themeMode"
            value={settings.theme.mode}
            onChange={(v) => update({ theme: { mode: v as "auto" | "light" | "dark" } })}
            options={[
              { value: "auto", label: "Auto (system)" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Format ── */}
      <SettingsSection title="Format">
        <SettingsRow
          label="Format on save"
          description="Run Prettier before each save / download (JS, TS, CSS, HTML, Markdown, YAML, JSON)"
          htmlFor="s-formatOnSave"
        >
          <Toggle
            id="s-formatOnSave"
            checked={settings.format.onSave}
            onChange={(v) => update({ format: { onSave: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Keymap ── */}
      <SettingsSection title="Keymap">
        <SettingsRow label="Key bindings" htmlFor="s-keymap">
          <Select
            id="s-keymap"
            value={settings.keymap}
            onChange={(v) => update({ keymap: v as "default" | "vim" | "emacs" })}
            options={[
              { value: "default", label: "Default" },
              { value: "vim", label: "Vim" },
              { value: "emacs", label: "Emacs" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

    </Drawer>
  );
}
