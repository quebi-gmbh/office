import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/paint");
}

const PaintApp = lazy(() =>
  import("~/paint/ui/PaintApp").then((m) => ({ default: m.PaintApp })),
);

export default function Paint() {
  const intro = <ToolIntro path="/paint" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <PaintApp />
        </Suspense>
      )}
    </ClientOnly>
  );
}
