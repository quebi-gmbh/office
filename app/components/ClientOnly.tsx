import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const emptySubscribe = () => () => {};

/**
 * Renders `children()` only after hydration; before that (during the build-time
 * prerender and the very first client render) it renders `fallback`.
 *
 * The tool routes mount browser-only editors (CodeMirror, TipTap, canvas, a Web
 * Worker, pdfjs) that can't run in the non-DOM prerender environment. Gating
 * them here keeps the route's prerendered HTML to a lightweight, crawlable
 * intro (see ToolIntro) while the real editor loads on the client.
 *
 * `children` is a thunk so the editor element isn't even constructed server-side.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: () => ReactNode;
  fallback?: ReactNode;
}) {
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  return <>{hydrated ? children() : fallback}</>;
}
