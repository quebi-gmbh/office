import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/pdf");
}

const PdfApp = lazy(() =>
  import("~/pdf/ui/PdfApp").then((m) => ({ default: m.PdfApp })),
);

export default function Pdf() {
  const intro = <ToolIntro path="/pdf" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <PdfApp />
        </Suspense>
      )}
    </ClientOnly>
  );
}
