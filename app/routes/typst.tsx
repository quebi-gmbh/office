/**
 * /typst — client-side Typst editor with live preview + PDF export.
 *
 * The editor (and the ~11 MB gzipped WASM compiler it pulls in) lives in
 * app/typst/TypstEditorScreen.tsx, dynamically imported and client-only gated
 * so this route prerenders to a lightweight, crawlable intro. The WASM/fonts
 * are only fetched once the editor chunk runs on the client.
 */
import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/typst");
}

const TypstEditorScreen = lazy(() =>
  import("~/typst/TypstEditorScreen").then((m) => ({
    default: m.TypstEditorScreen,
  })),
);

export default function Typst() {
  const intro = <ToolIntro path="/typst" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <TypstEditorScreen />
        </Suspense>
      )}
    </ClientOnly>
  );
}
