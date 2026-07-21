import { useEffect, useMemo, useRef } from "react";
import { useSyncExternalStore } from "react";
import { createEngine, type VectorEngine } from "~/vector/lib/engine";
import { createAutosave } from "~/vector/io/autosave";
import type { VectorState } from "~/vector/lib/types";

/**
 * Instantiates a stable {@link VectorEngine}, subscribes React to its store,
 * and wires up debounced localStorage autosave (persisting on every committed
 * change and on tab-hide).
 */
export function useVectorEditor(): { engine: VectorEngine; state: VectorState } {
  const engine = useMemo(() => createEngine(), []);
  const autosaveRef = useRef(createAutosave());

  const state = useSyncExternalStore(
    engine.store.subscribe,
    engine.store.getSnapshot,
    engine.store.getSnapshot,
  );

  useEffect(() => {
    const autosave = autosaveRef.current;
    autosave.start(() => engine.scene());
    // Persist on every committed mutation.
    engine.onChange = () => autosave.schedule();
    return () => {
      autosave.flush();
      autosave.stop();
      engine.onChange = undefined;
    };
  }, [engine]);

  return { engine, state };
}
