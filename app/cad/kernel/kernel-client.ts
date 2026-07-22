/**
 * Main-thread client for the Manifold kernel. Prefers the Web Worker (so the
 * WASM CSG kernel never blocks the UI); if a Worker can't be constructed it
 * transparently falls back to evaluating on the main thread. Only the latest
 * request matters, so stale in-flight results are dropped.
 */
import { buildOps } from "../lib/build";
import type { CadDoc } from "../lib/types";
import type { EvalResult, SolidOp } from "./protocol";

export interface KernelClient {
  /** Evaluate a whole document; resolves with the mesh + metadata. */
  evaluateDoc(doc: CadDoc, quality?: number): Promise<EvalResult & { warnings: string[] }>;
  dispose(): void;
}

export function createKernelClient(): KernelClient {
  let worker: Worker | null = null;
  let workerBroken = false;
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: EvalResult) => void; reject: (e: unknown) => void }>();

  function getWorker(): Worker | null {
    if (workerBroken) return null;
    if (worker) return worker;
    try {
      worker = new Worker(new URL("./manifold.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<EvalResult>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data);
        else p.reject(new Error(e.data.error ?? "kernel error"));
      };
      worker.onerror = () => {
        workerBroken = true;
      };
      return worker;
    } catch {
      workerBroken = true;
      return null;
    }
  }

  async function runOnMainThread(ops: SolidOp[], id: number, quality?: number): Promise<EvalResult> {
    const { loadKernel, evaluateOps } = await import("./eval-core");
    const w = await loadKernel();
    const core = evaluateOps(w, ops, quality);
    return { id, ok: true, ...core };
  }

  async function evaluateDoc(doc: CadDoc, quality?: number) {
    const { ops, warnings } = buildOps(doc);
    const id = nextId++;
    const w = getWorker();
    let res: EvalResult;
    if (w) {
      res = await new Promise<EvalResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ id, ops, quality });
      }).catch(async (err) => {
        // Worker failed mid-flight — fall back to the main thread once.
        workerBroken = true;
        pending.delete(id);
        try {
          return await runOnMainThread(ops, id, quality);
        } catch {
          throw err;
        }
      });
    } else {
      res = await runOnMainThread(ops, id, quality);
    }
    return { ...res, warnings };
  }

  return {
    evaluateDoc,
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
}
