/**
 * The preview's DOM side of the incremental render path (#128).
 *
 * Every compile used to hand the preview a fresh multi-megabyte SVG string that
 * went straight into `innerHTML`. That reparsed the whole document, let its
 * embedded `<style>` blocks re-enter the document (invalidating styles
 * *globally*) and relaid out tens of thousands of nodes — for a tree that was
 * ~99% identical to the one it replaced.
 *
 * Now the runtime emits a *patch* (see `PreviewFrame` in typst-runtime.ts) and
 * this module applies it with typst.ts's own `patchRoot`, which walks the two
 * trees by `data-tid` content hash and reuses the existing elements. The host
 * element is deliberately one React never reconciles: it is rendered with a
 * `ref` and no children, so React and the patcher can't fight over the nodes.
 */
import { patchRoot } from "@myriaddreamin/typst.ts/render/svg/patch";
import type { PreviewFrame } from "./typst-runtime";

/**
 * Class on the preview host. typst's stylesheet is re-anchored under it (see
 * {@link installTypstStylesheet}) so rules like `svg { fill: none }` stay inside
 * the preview instead of applying to every SVG on the page.
 */
export const PREVIEW_ROOT_CLASS = "typst-preview-root";

/**
 * What {@link applyPreviewFrame} did. `failed` means the live DOM and the
 * renderer have diverged: the host has been emptied and the caller must reset
 * the render session and recompile to get a standalone frame.
 */
export type FrameApplied = "installed" | "patched" | "failed";

/**
 * Install or patch `frame` into `host`.
 *
 * Markup is always parsed *detached*, so the parse never drags style
 * recalculation and layout behind it. A `full` frame then replaces the root
 * outright (once per session); every other frame is merged into the existing
 * tree node by node, and is only single-digit KB to begin with.
 */
export function applyPreviewFrame(
  host: HTMLElement,
  frame: PreviewFrame,
): FrameApplied {
  if (frame.stylesheet) installTypstStylesheet(frame.stylesheet);

  const next = parseSvgRoot(frame.markup);
  if (!next) {
    host.replaceChildren();
    return "failed";
  }
  if (frame.full) {
    host.replaceChildren(next);
    return "installed";
  }
  // No root to patch: React remounted the pane, or a previous patch failed.
  // Either way the renderer's idea of the DOM is stale.
  const prev = host.firstElementChild;
  if (!(prev instanceof SVGElement)) {
    host.replaceChildren();
    return "failed";
  }
  try {
    patchRoot(prev, next);
    return "patched";
  } catch (err) {
    // patchRoot throws when the patch references an element it can't find, i.e.
    // when the two trees have drifted apart. Blank the preview rather than
    // leave a half-applied document on screen; the caller rebuilds from scratch.
    console.warn("[typst] preview patch failed; rebuilding the preview", err);
    host.replaceChildren();
    return "failed";
  }
}

/** Parse patch markup into a detached `<svg>` root, or null if it isn't one. */
function parseSvgRoot(markup: string): SVGElement | null {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  const root = holder.firstElementChild;
  return root instanceof SVGElement ? root : null;
}

let stylesheetInstalled = false;

/**
 * Install typst's own stylesheet once per page, with every selector re-anchored
 * under `.typst-preview-root`.
 *
 * It ships inside the rendered SVG, so the old wholesale-replace path pushed it
 * back into the document on every single compile — which is exactly what made
 * style recalculation dominate the profile, since a stylesheet entering the
 * document invalidates styles document-wide. Installing it once removes that;
 * scoping it also stops its unqualified `svg { fill: none }` rule from reaching
 * every other SVG on the page (icons, the vector editor, …).
 */
function installTypstStylesheet(css: string): void {
  if (stylesheetInstalled) return;
  stylesheetInstalled = true;

  const style = document.createElement("style");
  style.setAttribute("data-typst-preview", "");
  document.head.append(style);

  const sheet = style.sheet;
  const rules = sheet ? scopedRules(css) : [];
  if (!sheet || rules.length === 0) {
    // Nothing to re-anchor with; unscoped beats an unstyled preview.
    style.textContent = css;
    return;
  }
  for (const rule of rules) {
    try {
      sheet.insertRule(rule, sheet.cssRules.length);
    } catch {
      /* a rule this browser doesn't understand — it wouldn't have applied */
    }
  }
}

/**
 * Parse `css` in a throwaway document and re-emit each rule, prefixing style
 * rules with the preview root class. Parsing via the CSSOM (rather than string
 * surgery) means the browser tells us where each selector ends.
 */
function scopedRules(css: string): string[] {
  const scratch = document.implementation.createHTMLDocument("");
  const style = scratch.createElement("style");
  style.textContent = css;
  // A `<style>` is only parsed once it belongs to a document.
  scratch.head.append(style);

  const out: string[] = [];
  for (const rule of Array.from(style.sheet?.cssRules ?? [])) {
    // Anything that isn't a plain style rule (@keyframes, …) has no selector to
    // qualify and is passed through untouched.
    if (!(rule instanceof CSSStyleRule)) {
      out.push(rule.cssText);
      continue;
    }
    const selector = rule.selectorText
      .split(",")
      .map((one) => `.${PREVIEW_ROOT_CLASS} ${one.trim()}`)
      .join(", ");
    out.push(`${selector} { ${rule.style.cssText} }`);
  }
  return out;
}
