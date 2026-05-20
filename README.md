# office.quebi.de

A small collection of open-source, browser-based office tools. No login, no backend — everything runs client-side and data stays on your device (session or local storage only).

Hosted publicly via GitHub Pages at **[office.quebi.de](https://office.quebi.de)**.

## Tools

- **Code editor** — [office.quebi.de/code](https://office.quebi.de/code) — full-featured CodeMirror 6 editor with 20+ language modes, linting, Prettier formatting, Vim/Emacs keymaps, Markdown preview, and share-by-URL. See [Code editor docs](docs/code-editor.md).
- **Document editor** — [office.quebi.de/doc](https://office.quebi.de/doc) — rich-text editor for notes and documents (coming soon).
- **Paint** — [office.quebi.de/paint](https://office.quebi.de/paint) — simple Paint-like drawing tool.

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

- [Bun](https://bun.sh) — runtime, package manager, and bundler (`bun build`)
- [React 19](https://react.dev) + [React Router 7](https://reactrouter.com) (SPA mode)
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling, CSS-first config in `app/app.css`. See `CLAUDE.md` → "Styling" for conventions.
- [CodeMirror 6](https://codemirror.net/) — code editor engine for `/code`. Mutable settings are hot-swapped via CM6 Compartments so the undo history, cursor, and selection always survive configuration changes. Language packs and heavy plugins (Prettier, Vim, Emacs, minimap, linters) are dynamic `import()` chunks that only load on demand, keeping the initial bundle well under 200 KB gzipped.
- File-based routing via the flat-routes convention (subset, see below). Non-index routes are lazy via `React.lazy()` so CodeMirror only loads when `/code` is visited.
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
| `code.tsx`        | `/code`      |
| `foo.bar.tsx`     | `/foo/bar`   |
| `$id.tsx`         | `/:id`       |
| `$.tsx`           | `/*` (splat) |
| `_layout.tsx`     | pathless     |

Routes are regenerated automatically as part of `bun run build` and `bun run dev`.

## Deploy

Pushes to `main` build and deploy via `.github/workflows/deploy.yml`. The build:

1. Bundles to `dist/` with `Bun.build`
2. Copies `public/` (including `CNAME`) into `dist/`
3. Writes `dist/404.html` as a copy of `index.html` so deep links like `/code`, `/doc`, and `/paint` survive a hard refresh on GitHub Pages.

DNS: point `office` (CNAME) at `<user>.github.io`.

## License

MIT
