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
import { $typst, initOptions, loadFonts } from "@myriaddreamin/typst.ts";
// Deep `?url` imports resolve via each package's "./wasm" export subpath.
import compilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import rendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";

import serifRegular from "./fonts/LibertinusSerif-Regular.ttf?url";
import serifBold from "./fonts/LibertinusSerif-Bold.ttf?url";
import serifItalic from "./fonts/LibertinusSerif-Italic.ttf?url";
import serifBoldItalic from "./fonts/LibertinusSerif-BoldItalic.ttf?url";
import monoRegular from "./fonts/DejaVuSansMono.ttf?url";

const FONT_URLS = [
  serifRegular,
  serifBold,
  serifItalic,
  serifBoldItalic,
  monoRegular,
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

/** Compile Typst source to PDF bytes. Throws with a readable message. */
export function compilePdf(source: string): Promise<Uint8Array> {
  return serialize(async () => {
    const typst = await getTypst();
    const pdf = await typst.pdf({ mainContent: source });
    if (!pdf) throw new Error("Compilation produced no PDF output.");
    return pdf;
  });
}
