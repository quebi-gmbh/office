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
  type RenderSession,
  type TypstCompiler,
  type TypstRenderer,
} from "@myriaddreamin/typst.ts";
import type { IncrementalServer } from "@myriaddreamin/typst.ts/compiler";
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

// ── Incremental preview pipeline ────────────────────────────────────────────
//
// Replacing the preview's SVG wholesale on every compile is what made a compile
// commit cost ~half a second (#128): re-setting `innerHTML` reparses a
// multi-megabyte document, its embedded `<style>` blocks re-enter the document
// and invalidate styles globally, and the whole tree relayouts — all to build a
// DOM that is ~99% identical to the one it replaces. The compile itself never
// showed up in the profile.
//
// So we hold on to the state that lets both halves of typst.ts work
// incrementally:
//
//   * an `IncrementalServer` on the compiler side, so a compile yields a vector
//     IR *delta* against the previous one rather than a whole document;
//   * a `RenderSession` on the renderer side, which merges those deltas and can
//     emit a *patch* — an SVG whose unchanged subtrees are collapsed into
//     `data-reuse-from` stubs — instead of a complete document.
//
// The view applies that patch with typst.ts's `patchRoot` (see svg-patch.ts),
// so a one-word edit touches a few dozen nodes instead of rebuilding tens of
// thousands, and `innerHTML` is only ever written once per session. Measured on
// a two-page document: the first frame is ~66 KB of markup and every subsequent
// one is 0.5–7 KB, against ~80 KB for every single compile before.
//
// Both objects are mutable wasm state shared by every compile, which is why
// every entry point below goes through `serialize`.

/**
 * Stable path for the preview's main file. It must not change between compiles:
 * the incremental compiler keys its state on the file path, and the snippet
 * API's `{ mainContent }` shorthand writes each compile to a fresh
 * `/tmp/<random>.typ`, which would defeat incremental compilation entirely.
 */
const PREVIEW_MAIN = "/preview-main.typ";

interface PreviewSession {
  compiler: TypstCompiler;
  renderer: TypstRenderer;
  incremental: IncrementalServer;
  render: RenderSession;
  /** True once a frame has been emitted, i.e. later frames are patches. */
  primed: boolean;
  dispose(): void;
}

/**
 * typst.ts only lends an `IncrementalServer` / `RenderSession` for the duration
 * of a callback and frees it as soon as that callback settles. We want one that
 * lives as long as the editor screen, so we hold the callback open forever and
 * keep its resolver as the free handle — the "leak the life span of session"
 * pattern from typst.ts's own docs.
 */
function holdOpen<T>(
  scope: (use: (value: T) => Promise<void>) => Promise<unknown>,
): Promise<[T, () => void]> {
  return new Promise<[T, () => void]>((resolve, reject) => {
    scope(
      (value) => new Promise<void>((release) => resolve([value, release])),
    ).catch(reject);
  });
}

async function openPreviewSession(): Promise<PreviewSession> {
  const typst = await getTypst();
  const compiler = await typst.getCompiler();
  const renderer = await typst.getRenderer();

  const [incremental, freeIncremental] = await holdOpen<IncrementalServer>(
    (use) => compiler.withIncrementalServer(use),
  );
  let render: RenderSession;
  let freeRender: () => void;
  try {
    [render, freeRender] = await holdOpen<RenderSession>((use) =>
      renderer.runWithSession(use),
    );
  } catch (err) {
    freeIncremental();
    throw err;
  }

  return {
    compiler,
    renderer,
    incremental,
    render,
    primed: false,
    dispose() {
      freeRender();
      freeIncremental();
    },
  };
}

let previewSession: Promise<PreviewSession> | null = null;

function currentSession(): Promise<PreviewSession> {
  if (!previewSession) {
    const opening = openPreviewSession();
    previewSession = opening;
    // A failed open must not be cached, or the screen can never recover.
    opening.catch(() => {
      if (previewSession === opening) previewSession = null;
    });
  }
  return previewSession;
}

/**
 * Throw the incremental state away. The next compile opens a fresh session and
 * emits a standalone frame, which is how the view recovers when patching fails
 * and the live DOM no longer matches what the renderer believes it drew.
 */
export function resetPreviewSession(): void {
  const pending = previewSession;
  previewSession = null;
  if (!pending) return;
  // Free the wasm-side state, but only after whatever is already queued has
  // finished with it — freeing under a running compile is a use-after-free.
  void serialize(() => pending.then((session) => session.dispose())).catch(
    () => {
      /* the session failed to open in the first place */
    },
  );
}

/** One compiled preview state, ready for the view to install or patch in. */
export interface PreviewFrame {
  /**
   * SVG markup for the preview root. When {@link full} it is a complete,
   * standalone document; otherwise it is a *patch* whose unchanged subtrees are
   * elided to `data-reuse-from` stubs, and it is only meaningful against the DOM
   * the previous frame left behind.
   */
  markup: string;
  /** Whether {@link markup} stands on its own, i.e. must replace the root. */
  full: boolean;
  /** Page count, straight from the render session (no string scanning). */
  pageCount: number;
  /**
   * typst's own stylesheet, sent once with the first frame of a session. The
   * patch frames deliberately omit it, so the view installs it a single time
   * instead of letting it re-enter the document on every compile.
   */
  stylesheet: string | null;
}

/** Pull `<style>` text out of a css-only render (a bare `<svg>` wrapper). */
function styleTextOf(markup: string): string {
  return /<style[^>]*>([\s\S]*?)<\/style>/.exec(markup)?.[1] ?? "";
}

/**
 * Compile `source` and produce the next preview frame. Compile diagnostics are
 * thrown verbatim, exactly as the previous one-shot API did, so the error UI is
 * unchanged.
 */
function compileFrame(source: string): Promise<PreviewFrame> {
  return serialize(async () => {
    const session = await currentSession();
    session.compiler.addSource(PREVIEW_MAIN, source);
    const compiled = await session.compiler.compile({
      mainFilePath: PREVIEW_MAIN,
      incrementalServer: session.incremental,
      diagnostics: "none",
    });
    const delta = compiled?.result;
    if (!delta) throw new Error("Compilation produced no output.");

    // Past this point nothing depends on the user's document any more: a
    // failure here is renderer plumbing, and leaves the session unusable.
    try {
      session.render.manipulateData({ action: "merge", data: delta });
      const markup = session.renderer.renderSvgDiff({
        renderSession: session.render,
      });
      const full = !session.primed;
      const stylesheet = full
        ? styleTextOf(
            await session.renderer.renderSvg({
              renderSession: session.render,
              data_selection: {
                body: false,
                defs: false,
                css: true,
                js: false,
              },
            }),
          )
        : null;
      session.primed = true;
      return {
        markup,
        full,
        stylesheet,
        pageCount: session.render.retrievePagesInfo().length,
      };
    } catch (err) {
      resetPreviewSession();
      throw err;
    }
  });
}

/**
 * The previewed document as one complete SVG string.
 *
 * The preview itself never materialises this — that is the whole point of the
 * incremental path — but the SVG/PNG/per-page exports still want a standalone
 * document, and `splitSvgPages` still wants a string to slice up.
 */
export function currentPreviewSvg(): Promise<string> {
  return serialize(async () => {
    const pending = previewSession;
    if (!pending) throw new Error("Nothing has been compiled yet.");
    const session = await pending;
    if (!session.primed) throw new Error("Nothing has been compiled yet.");
    return session.renderer.renderSvg({ renderSession: session.render });
  });
}

/**
 * Outcome of a coalescing preview compile. `superseded` means a newer request
 * replaced this one before it ever started — the caller must leave the UI alone
 * and let the newer request own the result.
 */
export type PreviewCompile =
  | { kind: "ok"; frame: PreviewFrame }
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
        job.resolve({ kind: "ok", frame: await compileFrame(job.source) });
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
 * The shared compiler + render session can only run one job at a time anyway,
 * so without this a burst of edits would queue up a compile per edit and the UI
 * would stay busy long after the user stopped typing — and a slow compile could
 * land after a newer one and overwrite the preview with stale output. It also
 * keeps frames strictly ordered, which the patch path *requires*: a frame is
 * only meaningful against the DOM its predecessor produced.
 */
export function compilePreviewLatest(source: string): Promise<PreviewCompile> {
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
