# office.quebi.de

A small collection of open-source, browser-based office tools. No login, no backend — everything runs client-side and data stays on your device (session or local storage only).

Hosted publicly via GitHub Pages at **[office.quebi.de](https://office.quebi.de)**.

## Tools

- **Code editor** — [office.quebi.de/code](https://office.quebi.de/code) — full-featured CodeMirror 6 editor with 20+ language modes, linting, Prettier formatting, Vim/Emacs keymaps, Markdown preview, and share-by-URL. See [Code editor docs](docs/code-editor.md).
- **Document editor** — [office.quebi.de/docs](https://office.quebi.de/docs) — rich-text editor for notes and documents (coming soon).
- **Paint** — [office.quebi.de/paint](https://office.quebi.de/paint) — simple Paint-like drawing tool.
- **Table** — [office.quebi.de/table](https://office.quebi.de/table) — paste anything tabular into a fast virtualised grid; edit, type-infer, sort, filter, and export to CSV / TSV / JSON / XLSX / Markdown / LaTeX / Python / NumPy / MATLAB / SQL and more. See [Table docs](docs/table.md).
- **PDF tools** — [office.quebi.de/pdf](https://office.quebi.de/pdf) — merge, split, rotate, crop, watermark, image-stamp, page numbers, draw & sign (vector ink, shapes, reusable signatures), fill AcroForms, edit metadata, extract text, build PDFs from images. Built on [pdf-lib](https://pdf-lib.js.org/) for editing and [pdfjs-dist](https://mozilla.github.io/pdf.js/) for rendering and text extraction. Both libraries are lazy-loaded only when `/pdf` is visited, so other tools aren't taxed by the ~1.5 MB worker bundle.

More tools may follow.

## Code editor

`/code` is a browser-only code editor built on [CodeMirror 6](https://codemirror.net/). Quick tour:

| Feature | How to trigger |
|---|---|
| Open file | File menu → Open file… or `Ctrl-O` |
| Save / download | File menu → Save or `Ctrl-S` |
| Share via URL | File menu → Share via URL… |
| Command palette | `Ctrl-Shift-P` |
| Settings | Gear icon or `Ctrl-,` |
| Format document | `Shift-Alt-F` (JS/TS/HTML/CSS/Markdown/YAML/JSON) |
| Markdown preview | `Ctrl-K V` (when Markdown is active language) |
| JSON pretty / minify | Pretty / Minify toolbar buttons (JSON language) |
| Switch language | Language picker in status bar |
| Vim / Emacs mode | Settings → Keymap |

Documents are auto-saved to `localStorage` every second (configurable). The language and settings are also persisted. Full settings reference and keybinding cheat sheet: [docs/code-editor.md](docs/code-editor.md).

## Tech

- [Bun](https://bun.sh) — runtime and package manager
- [Vite](https://vite.dev) + [React 19](https://react.dev) + [React Router 8](https://reactrouter.com) in **framework mode**, `ssr: false` with every route prerendered to static HTML (`react-router.config.ts`). Each page ships complete content + per-page meta for SEO / social / AI crawlers without running JS.
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling, CSS-first config in `app/app.css`, compiled by the `@tailwindcss/vite` plugin. See `CLAUDE.md` → "Styling" for conventions.
- [CodeMirror 6](https://codemirror.net/) — code editor engine for `/code`. Mutable settings are hot-swapped via CM6 Compartments so the undo history, cursor, and selection always survive configuration changes. Language packs and heavy plugins (Prettier, Vim, Emacs, minimap, linters) are dynamic `import()` chunks that only load on demand.
- File-based routing via `@react-router/fs-routes` (flat-routes convention, see below). Tool editors are dynamically imported and client-only gated so each route prerenders to a lightweight, crawlable intro.
- GitHub Pages for static hosting.

## SEO

`app/lib/site-routes.ts` is the single source of truth for routes + per-page metadata. It drives the `prerender()` list, the per-route `meta()` exports (`app/lib/seo.ts`), `public/sitemap.xml` + `public/robots.txt` (`scripts/prebuild.ts`), and one Open Graph image per route (`scripts/generate-og.ts`, satori + resvg). Add a route by adding an entry there.

## Develop

```sh
bun install
bun run dev        # Vite dev server with HMR
bun run build      # prebuild assets + OG images + react-router build → build/client/
bun run typecheck
```

## Routing

Files in `app/routes/` become routes via `@react-router/fs-routes` `flatRoutes()` (`app/routes.ts`). The supported subset of the flat-routes convention:

| File              | URL          |
|-------------------|--------------|
| `_index.tsx`      | `/`          |
| `code.tsx`        | `/code`      |
| `foo.bar.tsx`     | `/foo/bar`   |
| `$id.tsx`         | `/:id`       |
| `$.tsx`           | `/*` (splat) |
| `_layout.tsx`     | pathless     |

New routes should also be added to `app/lib/site-routes.ts` so they're prerendered and get metadata.

## Deploy

Pushes to `main` build and deploy via `.github/workflows/deploy.yml`. The build:

1. Runs `scripts/prebuild.ts` (pdfjs assets → `public/pdfjs/`, sitemap + robots) and `scripts/generate-og.ts` (OG images → `public/og/`).
2. Runs `react-router build`, prerendering every route to `build/client/<route>/index.html` (with a `__spa-fallback.html`).
3. Copies `__spa-fallback.html` → `404.html` so non-prerendered deep links still resolve client-side on GitHub Pages.

DNS: point `office` (CNAME) at `<user>.github.io`.

## License

MIT
