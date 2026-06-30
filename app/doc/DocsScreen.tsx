import { SettingsProvider } from "~/doc/settings-context";
import { DocEditor } from "~/doc/DocEditor";

/** Client-only entry for the /docs route — kept out of the route module so the
 *  heavy TipTap editor is dynamically imported only after hydration. */
export function DocsScreen() {
  return (
    <SettingsProvider>
      <DocEditor />
    </SettingsProvider>
  );
}
