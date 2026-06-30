/**
 * /code — CodeMirror-based code editor.
 *
 * The editor itself lives in app/code/CodeEditorScreen.tsx, dynamically imported
 * and client-only gated so this route prerenders to a lightweight, crawlable
 * intro (CodeMirror can't run in the non-DOM prerender environment).
 */
import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/code");
}

const CodeEditorScreen = lazy(() =>
  import("~/code/CodeEditorScreen").then((m) => ({ default: m.CodeEditorScreen })),
);

export default function Code() {
  const intro = <ToolIntro path="/code" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <CodeEditorScreen />
        </Suspense>
      )}
    </ClientOnly>
  );
}
