/**
 * Thin wrapper around the `@myriaddreamin/typst.ts` WASM compiler + renderer.
 *
 * Everything here runs client-side only. The compiler (~28 MB / ~11 MB gzip)
 * and renderer (~1 MB) `.wasm` modules and the bundled fonts are imported with
 * Vite's `?url` suffix so they become hashed, lazily-fetched static assets —
 * nothing is loaded until {@link getTypst} runs, which only happens after the
 * `/typst` route mounts on the client (see TypstEditorScreen).
 *
 * Fonts are self-hosted (no runtime CDN): we disable typst.ts's default remote
 * font assets and preload a small Libertinus Serif + DejaVu Sans Mono set from
 * app/typst/fonts. That keeps the tool consistent with the rest of the site —
 * no third party sees the document.
 */
import {
  $typst,
  FetchPackageRegistry,
  initOptions,
  loadFonts,
  MemoryAccessModel,
} from "@myriaddreamin/typst.ts";
// Deep `?url` imports resolve via each package's "./wasm" export subpath.
import compilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import rendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";

import serifRegular from "./fonts/LibertinusSerif-Regular.ttf?url";
import serifBold from "./fonts/LibertinusSerif-Bold.ttf?url";
import serifItalic from "./fonts/LibertinusSerif-Italic.ttf?url";
import serifBoldItalic from "./fonts/LibertinusSerif-BoldItalic.ttf?url";
import monoRegular from "./fonts/DejaVuSansMono.ttf?url";
// Typst's default math font ("New Computer Modern Math"). Without a font that
// carries an OpenType MATH table, math renders as tofu (□) boxes.
import mathBook from "./fonts/NewCMMath-Book.otf?url";

const FONT_URLS = [
  serifRegular,
  serifBold,
  serifItalic,
  serifBoldItalic,
  monoRegular,
  mathBook,
];

let configured = false;
let initPromise: Promise<typeof $typst> | null = null;

/**
 * Lazily configure and initialise the shared `$typst` instance. Safe to call
 * repeatedly — the WASM + fonts are only loaded once.
 */
export function getTypst(): Promise<typeof $typst> {
  if (!configured) {
    $typst.setCompilerInitOptions({
      getModule: () => compilerWasmUrl,
      beforeBuild: [
        // Self-host: don't pull the default font pack off jsdelivr.
        initOptions.disableDefaultFontAssets(),
        loadFonts(FONT_URLS),
      ],
    });
    $typst.setRendererInitOptions({ getModule: () => rendererWasmUrl });

    // In-browser package registry so documents can `#import "@preview/…"`.
    // Packages are fetched on demand from packages.typst.org (CORS-enabled)
    // and cached in this in-memory access model for the session — the only
    // compile-time network access, and only when a document imports a package.
    //
    // This MUST go through `.use()` (not setCompilerInitOptions.beforeBuild):
    // the snippet auto-injects its own default registry unless it sees a
    // registered provider whose key mentions "access-model"/"package-registry".
    // Adding our own via beforeBuild would let both run and set the access
    // model twice ("already set some access model before").
    const packageStore = new MemoryAccessModel();
    $typst.use(
      {
        key: "access-model",
        forRoles: ["compiler"],
        provides: [initOptions.withAccessModel(packageStore)],
      },
      {
        key: "package-registry",
        forRoles: ["compiler"],
        provides: [
          initOptions.withPackageRegistry(
            new FetchPackageRegistry(packageStore),
          ),
        ],
      },
    );
    configured = true;
  }
  if (!initPromise) {
    initPromise = (async () => {
      // Force both components to initialise up front so the first compile is
      // just a compile, and any WASM/font load failure surfaces here.
      await $typst.getCompiler();
      await $typst.getRenderer();
      return $typst;
    })();
  }
  return initPromise;
}

export interface CompileResult {
  /** Rendered document as an SVG string, ready to inject into the DOM. */
  svg: string;
}

/**
 * The `$typst` snippet keeps mutable shared state, so overlapping compiles can
 * corrupt each other. This queue guarantees compiles run strictly one at a
 * time; callers that fire faster than compiles finish should debounce and only
 * care about the latest result.
 */
let tail: Promise<unknown> = Promise.resolve();
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  // Keep the chain alive regardless of individual job outcome.
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Compile Typst source to an SVG string. Throws with a readable message. */
export function compileSvg(source: string): Promise<CompileResult> {
  return serialize(async () => {
    const typst = await getTypst();
    const svg = await typst.svg({ mainContent: source });
    if (!svg) throw new Error("Compilation produced no output.");
    return { svg };
  });
}

/**
 * Outcome of a coalescing preview compile. `superseded` means a newer request
 * replaced this one before it ever started — the caller must leave the UI alone
 * and let the newer request own the result.
 */
export type PreviewCompile =
  | { kind: "ok"; svg: string }
  | { kind: "superseded" };

interface QueuedPreview {
  source: string;
  resolve: (result: PreviewCompile) => void;
  reject: (err: unknown) => void;
}

let queuedPreview: QueuedPreview | null = null;
let previewRunning = false;

async function drainPreviewQueue(): Promise<void> {
  if (previewRunning) return;
  previewRunning = true;
  try {
    while (queuedPreview) {
      const job = queuedPreview;
      queuedPreview = null;
      try {
        const { svg } = await compileSvg(job.source);
        job.resolve({ kind: "ok", svg });
      } catch (err) {
        job.reject(err);
      }
    }
  } finally {
    previewRunning = false;
  }
}

/**
 * Compile for the *preview*, keeping at most one compile in flight and at most
 * one queued: a request that arrives while another is already waiting replaces
 * it, and the replaced one resolves as `superseded`.
 *
 * The shared `$typst` singleton can only run one job at a time anyway, so
 * without this a burst of edits would queue up a compile per edit and the UI
 * would stay busy long after the user stopped typing — and a slow compile could
 * land after a newer one and overwrite the preview with stale output.
 */
export function compileSvgLatest(source: string): Promise<PreviewCompile> {
  return new Promise<PreviewCompile>((resolve, reject) => {
    if (queuedPreview) queuedPreview.resolve({ kind: "superseded" });
    queuedPreview = { source, resolve, reject };
    void drainPreviewQueue();
  });
}

/** Compile Typst source to PDF bytes. Throws with a readable message. */
export function compilePdf(source: string): Promise<Uint8Array> {
  return serialize(async () => {
    const typst = await getTypst();
    const pdf = await typst.pdf({ mainContent: source });
    if (!pdf) throw new Error("Compilation produced no PDF output.");
    return pdf;
  });
}

/** A mounted DOM document handle we can dispose before re-rendering. */
export interface DomHandle {
  dispose(): void;
}

/**
 * Render `source` into `container` using typst.ts's DOM render mode, which
 * produces real DOM (with a selectable/copyable text layer) instead of an
 * inert SVG string. Returns a handle whose `dispose()` tears the mount down.
 *
 * This is experimental: the DOM renderer's exact behaviour isn't something we
 * can guarantee across typst.ts versions, so callers should wrap this in a
 * try/catch and fall back to the SVG preview on failure.
 */
export function renderDomInto(
  container: HTMLElement,
  source: string,
): Promise<DomHandle> {
  return serialize(async () => {
    const typst = await getTypst();
    const vector = await typst.vector({ mainContent: source });
    if (!vector) throw new Error("Compilation produced no output.");
    const renderer = await typst.getRenderer();
    // `renderDom` mounts into the container and returns a document object that
    // exposes a dispose()/cleanup path. The public type only allows a
    // pre-created `renderSession`, but the implementation also accepts
    // `artifactContent` (it creates + manages the session itself), which is
    // what we want for a fresh full re-mount on each compile.
    const doc = (await renderer.renderDom({
      container,
      artifactContent: vector,
    } as unknown as Parameters<typeof renderer.renderDom>[0])) as unknown as {
      dispose?: () => void;
    };
    return {
      dispose() {
        try {
          doc.dispose?.();
        } catch {
          /* best-effort */
        }
        // Ensure the container is emptied even if dispose is a no-op.
        container.replaceChildren();
      },
    };
  });
}
