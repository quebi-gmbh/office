/**
 * Dev server: rebuilds on file changes in app/ and public/, serves dist/ with
 * SPA fallback. No HMR — just a full rebuild + auto-reload on save.
 */
import { watch } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const DIST = join(ROOT, "dist");

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
      await $`bun run ${join(here, "build.ts")}`.quiet();
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
