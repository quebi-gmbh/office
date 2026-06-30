import { routeMeta } from "~/lib/site-routes";

/**
 * The server-safe shell rendered for a tool route during prerender and while
 * its client-only editor loads. Carries the route's <h1> + description so the
 * prerendered HTML has real, indexable content, then a skeleton placeholder.
 */
export function ToolIntro({ path }: { path: string }) {
  const r = routeMeta(path);
  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{r.name}</h1>
      <p className="max-w-[65ch] text-muted">{r.description}</p>
      <div
        aria-hidden="true"
        className="mt-6 h-64 animate-pulse rounded-xl border border-border bg-card"
      />
    </section>
  );
}
