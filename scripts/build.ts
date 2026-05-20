/**
 * Production build:
 *   1. Regenerates app/routes.gen.ts
 *   2. Bundles the client with `Bun.build`
 *   3. Copies /public into /dist
 *   4. Injects the hashed entry script into index.html
 *   5. Writes 404.html (copy of index.html) so GitHub Pages can SPA-fallback
 */
import { rm, mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const DIST = join(ROOT, "dist");
const PUBLIC = join(ROOT, "public");

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

await $`bun run ${join(here, "generate-routes.ts")}`;

const result = await Bun.build({
  entrypoints: [join(ROOT, "app/entry.client.tsx")],
  outdir: DIST,
  target: "browser",
  splitting: true,
  minify: true,
  sourcemap: "linked",
  naming: {
    entry: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    asset: "assets/[name]-[hash].[ext]",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const entry = result.outputs.find((o) => o.kind === "entry-point");
if (!entry) throw new Error("bun build produced no entry-point output");
const entryHref = "/" + relative(DIST, entry.path).replaceAll("\\", "/");

await cp(PUBLIC, DIST, { recursive: true });

const indexPath = join(DIST, "index.html");
const html = await readFile(indexPath, "utf8");
const injected = html.replace(
  "</body>",
  `    <script type="module" src="${entryHref}"></script>\n  </body>`,
);
await writeFile(indexPath, injected);
// GitHub Pages serves 404.html for unknown paths; reusing index.html turns it
// into a client-side router fallback so deep links like /text and /paint work.
await writeFile(join(DIST, "404.html"), injected);

console.log(`Build complete → ${relative(ROOT, DIST)}/`);
