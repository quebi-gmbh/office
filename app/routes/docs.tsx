import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/docs");
}

const DocsScreen = lazy(() =>
  import("~/doc/DocsScreen").then((m) => ({ default: m.DocsScreen })),
);

export default function Docs() {
  const intro = <ToolIntro path="/docs" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <DocsScreen />
        </Suspense>
      )}
    </ClientOnly>
  );
}
