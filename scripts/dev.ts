/**
 * Dev server: rebuilds on file changes in app/ and public/, serves dist/ with
 * SPA fallback. No HMR — just a full rebuild + auto-reload on save.
 *
 * Tailwind is owned here, not in build.ts:
 *   - One-shot compile to dist/styles.css before the dev server starts (so
 *     the very first request gets styled HTML).
 *   - Long-running `@tailwindcss/cli --watch` subprocess that rewrites
 *     dist/styles.css when app/app.css or any scanned .tsx changes.
 *   - build.ts is invoked with SKIP_CSS=1 so it doesn't fight the watcher
 *     (no `rm -rf dist`, no re-run of the Tailwind CLI).
 */
import { mkdir } from "node:fs/promises";
import { watch } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const DIST = join(ROOT, "dist");
const CSS_IN = join(ROOT, "app/app.css");
const CSS_OUT = join(DIST, "styles.css");

await mkdir(DIST, { recursive: true });

// 1. One-shot Tailwind compile so dist/styles.css exists before the first
//    HTTP request and before Bun.serve starts accepting connections.
await $`bunx --bun @tailwindcss/cli -i ${CSS_IN} -o ${CSS_OUT}`.quiet();

// 2. Long-running watcher. Inherits stdio so Tailwind compile errors are
//    visible in the dev terminal.
const tailwind = Bun.spawn(
  [
    "bunx",
    "--bun",
    "@tailwindcss/cli",
    "-i",
    CSS_IN,
    "-o",
    CSS_OUT,
    "--watch",
  ],
  { stdout: "inherit", stderr: "inherit" },
);
const stopTailwind = () => {
  try {
    tailwind.kill();
  } catch {}
};
process.on("SIGINT", () => {
  stopTailwind();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopTailwind();
  process.exit(0);
});
process.on("exit", stopTailwind);

const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();

let buildPromise: Promise<void> | null = null;
let pending = false;

async function build() {
  if (buildPromise) {
    pending = true;
    return;
  }
  buildPromise = (async () => {
    const t = performance.now();
    try {
      await $`SKIP_CSS=1 bun run ${join(here, "build.ts")}`.quiet();
      console.log(`✓ rebuilt in ${Math.round(performance.now() - t)}ms`);
      for (const c of clients) c.enqueue(encoder.encode("data: reload\n\n"));
    } catch (err) {
      console.error("✗ build failed", err);
    }
  })();
  await buildPromise;
  buildPromise = null;
  if (pending) {
    pending = false;
    build();
  }
}

await build();

let debounce: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(build, 100);
}

watch(join(ROOT, "app"), { recursive: true }, schedule);
watch(join(ROOT, "public"), { recursive: true }, schedule);

const RELOAD_SNIPPET = `<script>
new EventSource("/__dev/reload").addEventListener("message", () => location.reload());
</script>`;

const server = Bun.serve({
  port: Number(process.env.PORT ?? 7421),
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/__dev/reload") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          clients.add(controller);
          controller.enqueue(encoder.encode(": connected\n\n"));
        },
        cancel() {
          // controller is removed on disconnect; nothing else to do
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }

    let path = url.pathname;
    if (path.endsWith("/")) path += "index.html";

    const filePath = join(DIST, path);
    let file = Bun.file(filePath);
    if (!(await file.exists())) {
      file = Bun.file(join(DIST, "index.html"));
    }

    if (file.type.includes("html")) {
      const html = (await file.text()).replace("</body>", `${RELOAD_SNIPPET}</body>`);
      return new Response(html, { headers: { "content-type": "text/html" } });
    }
    return new Response(file);
  },
});

console.log(`dev: http://localhost:${server.port}`);
