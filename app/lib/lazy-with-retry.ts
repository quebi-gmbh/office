import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_FLAG = "office:chunk-reloaded";

/**
 * React.lazy wrapper that recovers from stale-chunk 404s after a deploy.
 *
 * Every GitHub Pages deploy rotates all asset hashes atomically. A returning
 * user with a cached index.html will try to import a chunk hash that no longer
 * exists; GitHub Pages serves 404.html (text/html) and the browser rejects it
 * as a module script.
 *
 * On a failed dynamic import this helper triggers a single page reload
 * (guarded by sessionStorage to avoid infinite loops). If the reload fixes it,
 * the fresh index.html + new chunk hashes load correctly and the flag is cleared
 * so recovery re-arms for the next deploy. If the chunk is genuinely missing
 * (two consecutive failures), the error is re-thrown to the route ErrorBoundary.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_FLAG); // success → re-arm for next deploy
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Return a never-resolving promise so Suspense keeps showing its
        // fallback skeleton during the reload instead of flashing an error.
        return new Promise<never>(() => {});
      }
      // Already reloaded once and still failing → surface to ErrorBoundary.
      throw err;
    }
  });
}
