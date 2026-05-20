# CLAUDE.md

Notes for agents (and humans) working on this repo. Keep it short; update it
when conventions shift.

## Stack

- Bun (runtime, package manager, bundler) — `bun run dev`, `bun run build`, `bun run typecheck`.
- React 19 + React Router 7 in SPA mode.
- File-based routes via `scripts/generate-routes.ts` → `app/routes.gen.ts`.
- Static hosting on GitHub Pages (`office.quebi.de`).

## Styling

Tailwind CSS v4, configured CSS-first.

- **Source:** `app/app.css` — contains `@import "tailwindcss"`, an `@theme`
  block defining the color and font tokens, a `@media (prefers-color-scheme: dark)`
  override that rebinds the same tokens, and any leftover plain CSS for views
  not yet migrated to utilities.
- **Output:** `dist/styles.css`, linked from `public/index.html` via
  `<link rel="stylesheet" href="/styles.css">`. The output file is generated
  by the Tailwind CLI; it is **not** processed by `Bun.build`.
- **Dev pipeline:** `scripts/dev.ts` runs a one-shot compile, then spawns
  `@tailwindcss/cli --watch` for the lifetime of the dev server. `build.ts`
  is invoked with `SKIP_CSS=1` so it doesn't fight the watcher.
- **Prod pipeline:** `scripts/build.ts` runs `@tailwindcss/cli --minify`
  after copying `public/` into `dist/`.

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
