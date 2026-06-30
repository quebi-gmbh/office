/**
 * Main-thread client for the compute worker. Offloads sort + group/aggregate so
 * big sheets don't freeze the UI. Falls back to running synchronously on the
 * main thread if a Worker can't be constructed (older browsers, file://).
 */
import { type TableDoc } from "~/table/lib/model";
import { type SortKey, sortDoc } from "~/table/lib/sort";
import { type AggSpec, groupAggregate } from "~/table/lib/transforms";
import { type Locale } from "~/table/lib/coltypes";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let unavailable = false;

function getWorker(): Worker | null {
  if (unavailable) return null;
  if (worker) return worker;
  try {
    // Vite bundles this worker entry and rewrites the URL at build time.
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; doc?: TableDoc; rows?: string[][]; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => { unavailable = true; };
    return worker;
  } catch {
    unavailable = true;
    return null;
  }
}

function call<T>(payload: Record<string, unknown>): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error("no worker"));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, ...payload });
  });
}

export async function sortDocAsync(doc: TableDoc, spec: SortKey[], locale: Locale): Promise<TableDoc> {
  try {
    const res = await call<{ doc: TableDoc }>({ op: "sort", doc, spec, locale });
    return res.doc;
  } catch {
    return sortDoc(doc, spec, locale); // sync fallback
  }
}

export async function groupAggregateAsync(doc: TableDoc, groupCols: number[], aggs: AggSpec[]): Promise<string[][]> {
  try {
    const res = await call<{ rows: string[][] }>({ op: "group", doc, groupCols, aggs });
    return res.rows;
  } catch {
    return groupAggregate(doc, groupCols, aggs); // sync fallback
  }
}
