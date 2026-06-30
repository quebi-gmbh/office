# CLAUDE.md

Notes for agents (and humans) working on this repo. Keep it short; update it
when conventions shift.

## Stack

- Bun (runtime + package manager) — `bun run dev`, `bun run build`, `bun run typecheck`.
- Vite + React 19 + React Router 8 in **framework mode**, `ssr: false` with
  every route prerendered to static HTML (`react-router.config.ts`).
- File-based routes via `@react-router/fs-routes` `flatRoutes()` in `app/routes.ts`
  (flat convention: `_index.tsx` → `/`, `code.tsx` → `/code`, …).
- Static hosting on GitHub Pages (`office.quebi.de`).

### SEO

- `app/lib/site-routes.ts` is the single source of truth for routes + per-page
  metadata (title, description, OG eyebrow/slug). It drives `prerender()`,
  `app/lib/seo.ts` (the per-route `meta()` exports), the sitemap, and OG images.
- `scripts/prebuild.ts` (run by `predev`/`build`) copies pdfjs runtime assets
  into `public/pdfjs/` and writes `public/sitemap.xml` + `public/robots.txt`.
- `scripts/generate-og.ts` (run by `build`) renders one 1200×630 OG image per
  route into `public/og/` with satori + resvg (fonts in `scripts/assets/`).
- Browser-only tool editors are gated behind `app/components/ClientOnly.tsx` so
  routes prerender to a crawlable `ToolIntro` (h1 + description) and mount the
  real editor after hydration.

## Styling

Tailwind CSS v4, configured CSS-first.

- **Source:** `app/app.css` — contains `@import "tailwindcss"`, an `@theme`
  block defining the color and font tokens, a `@media (prefers-color-scheme: dark)`
  override that rebinds the same tokens, and any leftover plain CSS for views
  not yet migrated to utilities.
- **Pipeline:** `app/app.css` is imported from `app/root.tsx` and processed by
  the `@tailwindcss/vite` plugin (see `vite.config.ts`). Vite injects the CSS
  via `<Links />` in dev and as a hashed asset in the prerendered HTML. There is
  no separate Tailwind CLI step anymore.

### Conventions

1. **Utility-first.** Author new UI with Tailwind utility classes directly in
   TSX. Reach for plain CSS in `app/app.css` only for things shaped like base
   styles (typography reset, `html/body`) or genuinely cross-cutting
   primitives.

2. **Theme tokens drive colors.** Use the semantic utilities
   (`bg-bg`, `text-fg`, `border-border`, `text-muted`, `bg-card`,
   `text-accent`) instead of raw Tailwind palette classes
   (`bg-zinc-50`, `text-blue-600`, …). Dark mode is system-driven via
   `prefers-color-scheme` — the tokens flip automatically, so no `dark:`
   modifiers are needed in component code.

3. **Reuse via components, not `@apply`.** When a class set repeats, extract
   a React component. Treat `@apply` as an escape hatch reserved for the rare
   cross-cutting primitive that doesn't fit a component.

4. **Migrate legacy BEM views incrementally.** `text.tsx` and `paint.tsx`
   still use BEM classes whose rules live in the bottom half of `app/app.css`.
   When migrating a view, delete the matching BEM block from `app/app.css`
   in the same commit.

## Routing

See README → "Routing" for the supported flat-routes subset.

## Deploy

`main` → GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages.
