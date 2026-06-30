/**
 * Pre-build / pre-dev step (Bun). Produces the static assets that aren't part
 * of the Vite/React Router bundle:
 *
 *   1. Copies pdfjs runtime assets (wasm / cmaps / standard_fonts) from
 *      node_modules into public/pdfjs/ so /pdfjs/* resolves at runtime.
 *   2. Generates public/sitemap.xml + public/robots.txt from the route registry.
 *
 * All outputs land in public/ (gitignored) and are copied into build/client by
 * Vite. Run before `react-router dev` (predev) and `react-router build` (build).
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_URL, SITE_ROUTES } from "../app/lib/site-routes";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const PUBLIC = join(ROOT, "public");
const PDFJS = join(ROOT, "node_modules/pdfjs-dist");

// 1. pdfjs runtime assets → public/pdfjs/
const pdfjsOut = join(PUBLIC, "pdfjs");
await rm(pdfjsOut, { recursive: true, force: true });
await mkdir(pdfjsOut, { recursive: true });
await Promise.all([
  cp(join(PDFJS, "wasm"), join(pdfjsOut, "wasm"), { recursive: true }),
  cp(join(PDFJS, "cmaps"), join(pdfjsOut, "cmaps"), { recursive: true }),
  cp(join(PDFJS, "standard_fonts"), join(pdfjsOut, "standard_fonts"), { recursive: true }),
]);

// 2. sitemap.xml + robots.txt
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...SITE_ROUTES.map((u) => `  <url><loc>${BASE_URL}${u}</loc></url>`),
  "</urlset>",
  "",
].join("\n");
await writeFile(join(PUBLIC, "sitemap.xml"), sitemap);

const robots = ["User-agent: *", "Allow: /", "", `Sitemap: ${BASE_URL}/sitemap.xml`, ""].join("\n");
await writeFile(join(PUBLIC, "robots.txt"), robots);

console.log(`prebuild: pdfjs assets + sitemap.xml (${SITE_ROUTES.length} urls) + robots.txt`);
