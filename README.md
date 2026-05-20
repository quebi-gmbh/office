# office.quebi.de

A small collection of open-source, browser-based office tools. No login, no backend — everything runs client-side and data stays on your device (session or local storage only).

Hosted publicly via GitHub Pages at **[office.quebi.de](https://office.quebi.de)**.

## Tools

- **Text editor** — [office.quebi.de/text](https://office.quebi.de/text) — lightweight editor (syntax highlighting coming soon).
- **Paint** — [office.quebi.de/paint](https://office.quebi.de/paint) — simple Paint-like drawing tool.

More tools may follow.

## Tech

- [Bun](https://bun.sh) — runtime, package manager, and bundler (`bun build`)
- [React 19](https://react.dev) + [React Router 7](https://reactrouter.com) (SPA mode)
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling, CSS-first config in `app/app.css`. See `CLAUDE.md` → "Styling" for conventions.
- File-based routing via the flat-routes convention (subset, see below)
- GitHub Pages for static hosting

## Develop

```sh
bun install
bun run dev      # http://localhost:3000, rebuilds + auto-reloads on save
bun run build    # production build → dist/
bun run typecheck
```

## Routing

Files in `app/routes/` become routes via a generator (`scripts/generate-routes.ts`) that produces `app/routes.gen.ts`. The supported subset of the flat-routes convention:

| File              | URL          |
|-------------------|--------------|
| `_index.tsx`      | `/`          |
| `text.tsx`        | `/text`      |
| `foo.bar.tsx`     | `/foo/bar`   |
| `$id.tsx`         | `/:id`       |
| `$.tsx`           | `/*` (splat) |
| `_layout.tsx`     | pathless     |

Routes are regenerated automatically as part of `bun run build` and `bun run dev`.

## Deploy

Pushes to `main` build and deploy via `.github/workflows/deploy.yml`. The build:

1. Bundles to `dist/` with `Bun.build`
2. Copies `public/` (including `CNAME`) into `dist/`
3. Writes `dist/404.html` as a copy of `index.html` so deep links like `/text` and `/paint` survive a hard refresh on GitHub Pages.

DNS: point `office` (CNAME) at `<user>.github.io`.

## License

MIT
