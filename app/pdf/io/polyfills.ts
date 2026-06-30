/**
 * Polyfills required by pdfjs-dist ≥ 6 that aren't yet in all evergreen browsers.
 *
 * `Map.prototype.getOrInsertComputed` / `WeakMap.prototype.getOrInsertComputed`
 * come from the TC39 "Upsert" proposal (Stage 2 as of mid-2026). pdfjs-dist v6
 * uses them throughout — without them you get
 *   `this[#$].getOrInsertComputed is not a function`
 * on the first render. Spec: https://tc39.es/proposal-upsert/
 *
 * Importing this module installs the polyfills as a side-effect; no exports.
 * Safe to import multiple times — each install is no-op'd if the method exists.
 */

type AnyMap = Map<unknown, unknown> | WeakMap<object, unknown>;

function getOrInsertComputed(this: AnyMap, key: never, callbackfn: (k: never) => unknown) {
  if ((this as Map<unknown, unknown>).has(key)) {
    return (this as Map<unknown, unknown>).get(key);
  }
  const value = callbackfn(key);
  (this as Map<unknown, unknown>).set(key, value);
  return value;
}

const proto = Map.prototype as unknown as Record<string, unknown>;
if (typeof proto.getOrInsertComputed !== "function") {
  Object.defineProperty(Map.prototype, "getOrInsertComputed", {
    value: getOrInsertComputed,
    writable: true,
    configurable: true,
  });
}

const wproto = WeakMap.prototype as unknown as Record<string, unknown>;
if (typeof wproto.getOrInsertComputed !== "function") {
  Object.defineProperty(WeakMap.prototype, "getOrInsertComputed", {
    value: getOrInsertComputed,
    writable: true,
    configurable: true,
  });
}
