import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/cad");
}

const CadApp = lazy(() => import("~/cad/ui/CadApp").then((m) => ({ default: m.CadApp })));

export default function Cad() {
  const intro = <ToolIntro path="/cad" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <CadApp />
        </Suspense>
      )}
    </ClientOnly>
  );
}
