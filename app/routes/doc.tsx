import { SettingsProvider } from "~/doc/settings-context";
import { DocEditor } from "~/doc/DocEditor";

export default function Doc() {
  return (
    <SettingsProvider>
      <DocEditor />
    </SettingsProvider>
  );
}
