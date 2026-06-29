/**
 * Production build:
 *   1. Regenerates app/routes.gen.ts
 *   2. Bundles the client with `Bun.build`
 *   3. Copies /public into /dist
 *   4. Compiles Tailwind CSS → dist/styles.css (minified)
 *   5. Injects the hashed entry script into index.html
 *   6. Writes 404.html (copy of index.html) so GitHub Pages can SPA-fallback
 *
 * `SKIP_CSS=1` is set by scripts/dev.ts, which owns Tailwind via --watch.
 * In that mode we also avoid `rm -rf dist` so the running watcher's
 * dist/styles.css survives across rebuilds — only dist/assets is cleaned.
 */
import { rm, mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const DIST = join(ROOT, "dist");
const PUBLIC = join(ROOT, "public");
const SKIP_CSS = !!process.env.SKIP_CSS;

if (SKIP_CSS) {
  await rm(join(DIST, "assets"), { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
} else {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

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

// Build the /table compute Web Worker as a separate, fixed-name ES module so the
// main thread can offload sort/group. Bun.build doesn't rewrite
// `new Worker(new URL(...))` under the SPA bundle, so we emit it explicitly here
// and reference "/assets/table-worker.js" at runtime (see app/table/io/compute.ts).
const workerResult = await Bun.build({
  entrypoints: [join(ROOT, "app/table/io/worker.ts")],
  outdir: join(DIST, "assets"),
  target: "browser",
  format: "esm",
  minify: true,
  naming: { entry: "table-worker.js", chunk: "tw-[hash].[ext]", asset: "[name]-[hash].[ext]" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!workerResult.success) {
  for (const log of workerResult.logs) console.error(log);
  process.exit(1);
}

// Build pdfjs's worker as a separate fixed-name module. pdfjs reads
// GlobalWorkerOptions.workerSrc at runtime (see app/pdf/io/pdfjs.ts), so
// emitting it at a known path lets us avoid `new Worker(new URL(...))` rewriting.
const pdfWorkerResult = await Bun.build({
  entrypoints: [join(ROOT, "app/pdf/io/pdfjs-worker.ts")],
  outdir: join(DIST, "assets"),
  target: "browser",
  format: "esm",
  minify: true,
  naming: { entry: "pdf-worker.js", chunk: "pw-[hash].[ext]", asset: "[name]-[hash].[ext]" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!pdfWorkerResult.success) {
  for (const log of pdfWorkerResult.logs) console.error(log);
  process.exit(1);
}

const entry = result.outputs.find((o) => o.kind === "entry-point");
if (!entry) throw new Error("bun build produced no entry-point output");
const entryHref = "/" + relative(DIST, entry.path).replaceAll("\\", "/");

await cp(PUBLIC, DIST, { recursive: true });

if (!SKIP_CSS) {
  await $`bunx --bun @tailwindcss/cli -i ${join(ROOT, "app/app.css")} -o ${join(DIST, "styles.css")} --minify`.quiet();
}

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
