import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/vector");
}

const VectorApp = lazy(() =>
  import("~/vector/ui/VectorApp").then((m) => ({ default: m.VectorApp })),
);

export default function Vector() {
  const intro = <ToolIntro path="/vector" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <VectorApp />
        </Suspense>
      )}
    </ClientOnly>
  );
}
