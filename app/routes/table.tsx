/**
 * /table — paste-anything spreadsheet.
 *
 * The heavy grid + Web Worker live in app/table/, dynamically imported and
 * client-only gated so the route prerenders to a lightweight, crawlable intro.
 */
import { lazy, Suspense } from "react";
import { ClientOnly } from "~/components/ClientOnly";
import { ToolIntro } from "~/components/ToolIntro";
import { seo } from "~/lib/seo";

export function meta() {
  return seo("/table");
}

const TableApp = lazy(() =>
  import("~/table/ui/TableApp").then((m) => ({ default: m.TableApp })),
);

export default function Table() {
  const intro = <ToolIntro path="/table" />;
  return (
    <ClientOnly fallback={intro}>
      {() => (
        <Suspense fallback={intro}>
          <TableApp />
        </Suspense>
      )}
    </ClientOnly>
  );
}
