import { SettingsProvider } from "~/doc/settings-context";
import { DocEditor } from "~/doc/DocEditor";

export default function Docs() {
  return (
    <SettingsProvider>
      <DocEditor />
    </SettingsProvider>
  );
}
