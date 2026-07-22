/**
 * `useCad` builds the document store and wires it to side effects: it
 * (re)evaluates the feature tree in the Manifold worker whenever the document
 * changes (debounced) and autosaves to localStorage. A React context exposes
 * the store to the whole editor tree.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { createKernelClient, type KernelClient } from "../kernel/kernel-client";
import { createAutosave, type Autosave } from "../io/autosave";
import { createCadStore, type CadState, type CadStore } from "../lib/store";
import type { CadDoc } from "../lib/types";

const CadContext = createContext<CadStore | null>(null);

export function CadProvider({ initialDoc, children }: { initialDoc: CadDoc; children: ReactNode }) {
  const storeRef = useRef<CadStore | null>(null);
  if (!storeRef.current) storeRef.current = createCadStore(initialDoc);
  const store = storeRef.current;

  const kernelRef = useRef<KernelClient | null>(null);
  if (!kernelRef.current) kernelRef.current = createKernelClient();
  const autosaveRef = useRef<Autosave | null>(null);
  if (!autosaveRef.current) autosaveRef.current = createAutosave();

  useEffect(() => {
    const kernel = kernelRef.current!;
    const autosave = autosaveRef.current!;
    autosave.start(() => store.getState().doc);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = (doc: CadDoc) => {
      store.getState().setEvalPending();
      kernel
        .evaluateDoc(doc)
        .then((res) => {
          if (res.ok && res.mesh) {
            store.getState().setEvalResult(
              {
                mesh: res.mesh,
                bbox: res.bbox,
                volume: res.volume ?? 0,
                surfaceArea: res.surfaceArea ?? 0,
                triangles: res.triangles ?? 0,
              },
              res.warnings,
            );
          } else {
            store.getState().setEvalError(res.error ?? "Evaluation failed", res.warnings);
          }
        })
        .catch((e) => store.getState().setEvalError(e instanceof Error ? e.message : String(e), []));
    };

    run(store.getState().doc);

    const unsub = store.subscribe((s, prev) => {
      if (s.doc !== prev.doc) {
        autosave.schedule();
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => run(store.getState().doc), 140);
      }
    });

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      autosave.stop();
      kernel.dispose();
    };
  }, [store]);

  return <CadContext.Provider value={store}>{children}</CadContext.Provider>;
}

export function useCadStore(): CadStore {
  const store = useContext(CadContext);
  if (!store) throw new Error("useCadStore must be used within <CadProvider>");
  return store;
}

export function useCad<T>(selector: (s: CadState) => T): T {
  const store = useCadStore();
  return useStore(store, selector);
}
