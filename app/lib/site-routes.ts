/**
 * Single source of truth for the site's routes and per-page metadata.
 *
 * Drives four things so they can never drift apart:
 *   - react-router.config.ts  → prerender() list
 *   - app/lib/seo.ts          → per-route <title>/description/canonical/OG tags
 *   - scripts/prebuild.ts     → sitemap.xml + robots.txt
 *   - scripts/generate-og.ts  → one Open Graph image per route
 *
 * Plain data only (no JSX / no `~` alias imports) so it can be imported from
 * the RR config and Bun build scripts, which run outside Vite's resolution.
 */
export const BASE_URL = "https://office.quebi.de";
export const SITE = "office.quebi.de";

export interface RouteMeta {
  /** URL path, beginning with "/". */
  path: string;
  /** OG image basename in /og/ (no extension). Home uses "default". */
  slug: string;
  /** Display name — used as the <h1>/<title> stem. */
  name: string;
  /** Uppercase category label, shown as the OG eyebrow. */
  eyebrow: string;
  /** 1–2 sentence description for meta + the prerendered intro. */
  description: string;
  /** Use `name` verbatim as the title instead of appending the site name. */
  exactTitle?: boolean;
}

export const ROUTES: RouteMeta[] = [
  {
    path: "/",
    slug: "default",
    name: "office.quebi.de — free browser-based office tools",
    eyebrow: "quebi GmbH",
    description:
      "A small collection of open-source, browser-based office tools — a code editor, document editor, paint canvas, spreadsheet, and PDF tools. No login, no backend, no tracking.",
    exactTitle: true,
  },
  {
    path: "/code",
    slug: "code",
    name: "Code editor",
    eyebrow: "Developer tools",
    description:
      "A full-featured CodeMirror 6 code editor in your browser — 20+ languages, linting, Prettier formatting, Vim/Emacs keymaps, a command palette, and share-by-URL. Runs entirely client-side.",
  },
  {
    path: "/docs",
    slug: "docs",
    name: "Document editor",
    eyebrow: "Writing",
    description:
      "A rich-text document editor for notes and writing — headings, lists, tables, code blocks, footnotes, focus mode, and Markdown/Word import. Everything stays on your device.",
  },
  {
    path: "/paint",
    slug: "paint",
    name: "Paint",
    eyebrow: "Graphics",
    description:
      "A simple browser-based paint and drawing canvas — brushes, shapes, text, zoom, and paste-from-clipboard. Missing MS Paint? Crop a screenshot or scribble a note without installing anything.",
  },
  {
    path: "/vector",
    slug: "vector",
    name: "Vector editor",
    eyebrow: "Graphics",
    description:
      "A browser-based vector editor — draw shapes, pen and freehand paths, and text; group, align, and restyle with gradients and dashes; export to SVG, PNG, or PDF. All client-side.",
  },
  {
    path: "/table",
    slug: "table",
    name: "Table",
    eyebrow: "Data",
    description:
      "Paste anything tabular into a fast virtualised spreadsheet — edit, sort, filter, transform, add formulas, and export anywhere. All client-side, no upload.",
  },
  {
    path: "/pdf",
    slug: "pdf",
    name: "PDF tools",
    eyebrow: "Documents",
    description:
      "Client-side PDF tools — merge, split, crop, rotate, watermark, fill forms, edit metadata, and extract text or images. Your files never leave the browser.",
  },
  {
    path: "/cad",
    slug: "cad",
    name: "CAD tool",
    eyebrow: "3D modelling",
    description:
      "A browser-based parametric CAD tool — sketch with constraints and dimensions, then extrude, revolve, or boolean into solids. Feature tree, autosave, and STL/GLB/PNG export.",
  },
  {
    path: "/typst",
    slug: "typst",
    name: "Typst editor",
    eyebrow: "Writing",
    description:
      "A browser-based Typst editor with syntax highlighting, live preview, and PDF/SVG/PNG export. The compiler runs entirely in your browser — nothing is uploaded.",
  },
];

/** Just the paths, for prerender() and sitemap generation. */
export const SITE_ROUTES = ROUTES.map((r) => r.path);

/** Look up a route's metadata by path. Throws if unknown (build-time guard). */
export function routeMeta(path: string): RouteMeta {
  const r = ROUTES.find((x) => x.path === path);
  if (!r) throw new Error(`No route metadata defined for "${path}" in app/lib/site-routes.ts`);
  return r;
}
