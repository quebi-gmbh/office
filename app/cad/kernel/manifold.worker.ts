/// <reference lib="webworker" />
/**
 * Manifold kernel worker. Runs the WASM CSG kernel off the main thread so
 * feature-tree evaluation never blocks the UI. Receives a compiled list of
 * {@link SolidOp}, accumulates them with boolean operations (see eval-core),
 * and posts back a triangle mesh plus metadata.
 */
import { evaluateOps, loadKernel } from "./eval-core";
import type { EvalRequest, EvalResult } from "./protocol";

self.onmessage = async (e: MessageEvent<EvalRequest>) => {
  const req = e.data;
  try {
    const w = await loadKernel();
    const core = evaluateOps(w, req.ops, req.quality);
    const res: EvalResult = { id: req.id, ok: true, ...core };
    const transfer: Transferable[] = [];
    if (res.mesh) transfer.push(res.mesh.position.buffer, res.mesh.index.buffer);
    (self as unknown as Worker).postMessage(res, transfer);
  } catch (err) {
    const res: EvalResult = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};
