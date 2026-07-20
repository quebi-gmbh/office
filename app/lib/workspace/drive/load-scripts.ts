/** Load an external script once, caching the promise by src. */
const cache = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("No document (server render)"));
  }
  let p = cache.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
    cache.set(src, p);
  }
  return p;
}
